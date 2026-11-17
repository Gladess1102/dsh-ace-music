/**
 * dsh-ace-music —— 把 ACE Music 的 MCP 服务器接进 DeepSeek Harness。
 *
 * 为什么需要插件：acemusic.ai/mcp 只接受 OAuth 令牌，而 DSH 自带的
 * `@deepseek-ai/dsh-mcp-client` 只支持静态请求头、不处理 401 的 OAuth 挑战。
 * 所以本插件自己完成「动态注册 → PKCE 授权 → 换取/刷新令牌」，再用令牌把远端
 * 的 10 个工具桥接成原生 DSH 工具（`acemusic_*`）。
 *
 * 远端事实（2026-11 实测）：serverInfo.name = acemusic，协议 2025-06-18，
 * scope = songs:read songs:create，access_token 有效期 3600 秒。
 */
import { join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { execFile } from 'node:child_process'

import { OAUTH, registerClient, beginAuthorization, startCallbackServer, exchangeCode, refreshToken } from './src/oauth.js'
import { McpClient, renderToolResult } from './src/mcp.js'
import { musicxmlToAbc } from './src/musicxml.js'

export const name = 'dsh-ace-music'
export const inject = ['tools']

const STATE_DIR = join(homedir(), '.dsh', 'ace-music')
const CRED_FILE = join(STATE_DIR, 'credentials.json')
const SKILL_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'docs', 'skills')
const DEFAULT_PORT = 8765
const LOGIN_TIMEOUT_MS = 300_000
const CALL_TIMEOUT_MS = 300_000

/** 载入宿主提供的 defineTool。裸导入优先，退回 asar 内的绝对路径。 */
async function loadDefineTool() {
  try {
    const mod = await import('@deepseek-ai/dsh-tools')
    const fn = mod.defineTool ?? mod.default?.defineTool
    if (typeof fn === 'function') return fn
  } catch { /* 继续找绝对路径 */ }
  const candidates = []
  const install = process.env.DSH_INSTALL_DIR
  if (install) candidates.push(join(install, '..', 'dsh-tools', 'lib', 'index.js'))
  if (process.resourcesPath) {
    candidates.push(join(process.resourcesPath, 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-tools', 'lib', 'index.js'))
  }
  for (const file of candidates) {
    try {
      const mod = await import(pathToFileURL(file).href)
      const fn = mod.defineTool ?? mod.default?.defineTool
      if (typeof fn === 'function') return fn
    } catch { /* 换下一个候选 */ }
  }
  throw new Error('dsh-ace-music: 找不到宿主的 @deepseek-ai/dsh-tools')
}

const readCredentials = async () => {
  try { return JSON.parse(await readFile(CRED_FILE, 'utf8')) } catch { return null }
}
const writeCredentials = async (value) => {
  await mkdir(STATE_DIR, { recursive: true })
  await writeFile(CRED_FILE, JSON.stringify(value, null, 2), { mode: 0o600 })
}
const clearCredentials = async () => { try { await unlink(CRED_FILE) } catch { /* 已经不存在 */ } }

/**
 * ACE Music 官方写作规范（cover / lyrics / mashup / score-format）随插件内置一份，
 * 这样模型动笔前不用先联网调一次 get_skill。文件原名原样取自官方 get_skill 输出。
 */
async function readLocalSkill(name) {
  if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(name)) return null
  try { return await readFile(join(SKILL_DIR, `${name}.md`), 'utf8') } catch { return null }
}

/** JSON Schema 片段 → DSH 参数 DSL。 */
function convertType(schema) {
  if (!schema || typeof schema !== 'object') return { type: 'string' }
  const out = {}
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type
  if (schema.description) out.description = schema.description
  if (schema.enum) { out.type = 'string'; out.enum = schema.enum; return out }
  switch (type) {
    case 'integer': out.type = 'integer'; break
    case 'number': out.type = 'number'; break
    case 'boolean': out.type = 'boolean'; break
    case 'array':
      out.type = 'array'
      out.items = convertType(schema.items)
      break
    case 'object':
      out.type = 'object'
      out.properties = convertParameters(schema.properties ?? {}, schema.required ?? [])
      // DSH 的参数 DSL 要求 object 显式声明 additionalProperties
      out.additionalProperties = schema.additionalProperties === true
      break
    default: out.type = 'string'
  }
  if (schema.default !== undefined) out.default = schema.default
  return out
}

function convertParameters(properties = {}, required = []) {
  const params = {}
  for (const [key, schema] of Object.entries(properties)) {
    params[key] = convertType(schema)
    if (required.includes(key)) params[key].required = true
  }
  return params
}

/** 在 macOS 上用默认浏览器打开授权页。 */
function openBrowser(url) {
  execFile('open', [url], (err) => { if (err) { /* 打不开就只返回链接 */ } })
}

export async function apply(ctx) {
  const defineTool = await loadDefineTool()
  const port = Number(process.env.ACE_MUSIC_PORT || DEFAULT_PORT)
  const redirectUri = `http://127.0.0.1:${port}/callback`

  let creds = await readCredentials()
  let client = null
  const remote = new Map()

  const mcp = () => {
    if (!client) {
      client = new McpClient({ url: OAUTH.resource, token: accessToken })
    }
    return client
  }

  /** 取一个可用令牌，必要时刷新。 */
  async function accessToken() {
    // 插件启动时可能还没登录；每次取令牌前按需重读磁盘，登录后无需重启即可用。
    if (!creds) creds = await readCredentials()
    if (!creds?.access_token && !creds?.refresh_token) {
      throw Object.assign(new Error('尚未登录 ACE Music，请先调用 acemusic_login'), { code: 'NOT_LOGGED_IN' })
    }
    const expiring = creds.expires_at && Date.now() > creds.expires_at - 60_000
    if (credentials_usable() && !expiring) return creds.access_token
    if (!creds.refresh_token) {
      throw Object.assign(new Error('ACE Music 登录已过期，请重新调用 acemusic_login'), { code: 'NOT_LOGGED_IN' })
    }
    const refreshed = await refreshToken({ refreshToken: creds.refresh_token, clientId: creds.client_id })
    creds = {
      ...creds,
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || creds.refresh_token,
      expires_at: Date.now() + (refreshed.expires_in || 3600) * 1000,
      scope: refreshed.scope || creds.scope,
    }
    await writeCredentials(creds)
    return creds.access_token
  }

  const credentials_usable = () => Boolean(creds?.access_token)

  /** 用远端工具列表刷新本地的 acemusic_* 工具。 */
  async function bridgeTools() {
    const tools = await mcp().listTools()
    for (const dispose of remote.values()) { try { dispose() } catch { /* 已释放 */ } }
    remote.clear()
    for (const tool of tools) {
      const localName = `acemusic_${tool.name}`.slice(0, 64)
      const definition = defineTool({
        name: localName,
        description: `${tool.description ?? tool.name}\n\n（ACE Music 远端工具 ${tool.name}，本工具由 dsh-ace-music 桥接）`,
        parameters: convertParameters(tool.inputSchema?.properties ?? {}, tool.inputSchema?.required ?? []),
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }],
        },
        timeoutMs: tool.name === 'create_song' ? CALL_TIMEOUT_MS : 90_000,
        async execute(args) {
          // 官方写作规范随插件内置：离线可读，不必先联网。
          if (tool.name === 'get_skill') {
            const local = await readLocalSkill(args?.name)
            if (local) {
              return `${local.trim()}\n\n---\n（此副本随插件内置，离线可读。若怀疑 ACE Music 已更新规范，用 acemusic_call 传 name="${args?.name}" 取远端最新版。）`
            }
          }
          try {
            const result = await mcp().callTool(tool.name, args ?? {})
            return renderToolResult(result)
          } catch (err) {
            if (err?.code === 'UNAUTHORIZED') { mcp().reset() }
            return `调用 ${tool.name} 失败：${err?.message ?? String(err)}`
          }
        },
      })
      remote.set(tool.name, ctx.tools.register(definition))
    }
    return tools
  }

  ctx.effect(() => () => {
    for (const dispose of remote.values()) { try { dispose() } catch { /* 已释放 */ } }
    remote.clear()
  })

  const textOut = (text) => ({ schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] })

  // ───────────────────────────── acemusic_login ─────────────────────────────
  ctx.tools.register(defineTool({
    name: 'acemusic_login',
    description: '登录 ACE Music。返回一个授权链接并在后台等待你在浏览器里点「允许」；授权完成后令牌会存到本机（~/.dsh/ace-music，仅当前用户可读），随后 acemusic_* 工具即可用。登录只需做一次，令牌过期会自动续期。',
    parameters: {},
    output: textOut(),
    async execute() {
      const server = await startCallbackServer(port).catch((err) => {
        throw new Error(`本地回调端口 ${port} 不可用（${err.message}），可用环境变量 ACE_MUSIC_PORT 换一个`)
      })
      try {
        const clientId = await registerClient(server.redirectUri)
        const auth = beginAuthorization(clientId, server.redirectUri)
        openBrowser(auth.url)
        server.waitForCode(LOGIN_TIMEOUT_MS).then(async (code) => {
          const token = await exchangeCode({ code, clientId, verifier: auth.verifier, redirectUri: server.redirectUri })
          creds = {
            client_id: clientId,
            access_token: token.access_token,
            refresh_token: token.refresh_token,
            expires_at: Date.now() + (token.expires_in || 3600) * 1000,
            scope: token.scope,
          }
          await writeCredentials(creds)
          client = null
          await bridgeTools().catch(() => {})
        }).catch(async () => { /* 超时或被拒：保持未登录状态 */ }).finally(() => server.close())

        return [
          '需要在浏览器里完成授权：',
          '',
          auth.url,
          '',
          `浏览器应该已经自动打开。若没有，请手动访问上面的链接。授权页会显示「将 DeepSeek Harness (ACE Music plugin) 连接到 ACE Music」，点「允许」即可。`,
          `等待回调的地址是 ${server.redirectUri}，最长等 ${LOGIN_TIMEOUT_MS / 1000} 秒。`,
          '完成或超时后，用 acemusic_status 查看登录状态。',
        ].join('\n')
      } catch (err) {
        await server.close()
        return `登录流程启动失败：${err?.message ?? String(err)}`
      }
    },
  }))

  // ───────────────────────────── acemusic_status ────────────────────────────
  ctx.tools.register(defineTool({
    name: 'acemusic_status',
    description: '查看 ACE Music 的登录状态；已登录时一并返回账号套餐与剩余积分（调用远端 get_account）。',
    parameters: {},
    output: textOut(),
    async execute() {
      const saved = await readCredentials()
      creds = saved || creds
      if (!credentials_usable()) {
        return '尚未登录 ACE Music。调用 acemusic_login 获取授权链接。'
      }
      const lines = [`登录状态：已登录（令牌${creds.expires_at ? `，有效期至 ${new Date(creds.expires_at).toLocaleString('zh-CN')}` : ''}）`]
      if (creds.scope) lines.push(`授权范围：${creds.scope}`)
      try {
        const account = renderToolResult(await mcp().callTool('get_account', {}))
        lines.push('', '账号信息：', account)
      } catch (err) {
        lines.push('', `账号信息获取失败：${err?.message ?? String(err)}`)
      }
      return lines.join('\n')
    },
  }))

  // ──────────────────────────── acemusic_relogin ────────────────────────────
  ctx.tools.register(defineTool({
    name: 'acemusic_logout',
    description: '退出 ACE Music 登录，删除本机保存的令牌。之后需要重新 acemusic_login。',
    parameters: {},
    output: textOut(),
    async execute() {
      await clearCredentials()
      creds = null
      client = null
      for (const dispose of remote.values()) { try { dispose() } catch { /* 已释放 */ } }
      remote.clear()
      return '已退出 ACE Music 登录，本机令牌已删除。'
    },
  }))

  // ──────────────────────────── acemusic_score ──────────────────────────────
  ctx.tools.register(defineTool({
    name: 'acemusic_score',
    description: [
      '把 MusicXML 谱转成 ACE Music v1.1 能唱的 ABC 谱（create_song 的 score.abc）。',
      '为什么需要它：ACE 的 MCP 只收 ABC 或 MIDI，而 MusicXML 才是适合模型逐小节写谱的格式——它结构规整、可校验，一个文件同时含音高、时值、歌词、和弦、力度与速度。',
      '输入可以是 MusicXML 文本，也可以是一个本地 .musicxml / .xml 文件路径。',
      '转换规则：只保留 V: Vocal（有歌词的旋律）与 V: Ins（器乐线）；<chord/> 堆叠取最高音；<harmony> 转成 "C" 和弦符号；段落由 <rehearsal> 推导成 % section，必须与歌词里的 [section] 标签同序同数，否则 ACE 会拒收。',
      '转换后把返回的 ABC 原样传给 acemusic_create_song 的 score.abc，并让 lyrics 的段落标签与它一致。',
    ].join('\n'),
    parameters: {
      musicxml: { type: 'string', required: true, description: 'MusicXML 文本（以 <?xml 或 <score-partwise 开头），或本地 .musicxml/.xml 文件路径' },
      title: { type: 'string', description: '曲名；缺省取 MusicXML 里的 movement-title / work-title' },
    },
    output: textOut(),
    async execute(args) {
      const input = String(args.musicxml ?? '').trim()
      if (!input) return '请提供 MusicXML 文本或文件路径。'
      let xml = input
      if (!/^<\?xml|^<score-partwise|^<score-timewise/i.test(input)) {
        try { xml = await readFile(input, 'utf8') }
        catch { return `既不是 MusicXML 文本，也读不到文件：${input.slice(0, 120)}` }
      }
      try {
        const out = musicxmlToAbc(xml, { title: args.title })
        const lines = [
          `已转换：${out.voices} 个声部、${out.bars} 小节、${out.lyrics.length} 个歌词音节`,
          out.sections.length ? `段落：${out.sections.join(' → ')}（歌词的 [section] 标签必须与此同序同数）` : '未检测到段落标记（<rehearsal>），歌词请不要带分段标签',
          out.warnings.length ? `注意：${out.warnings.join('；')}` : '',
          '',
          '```abc',
          out.abc,
          '```',
        ].filter((l) => l !== '')
        return lines.join('\n')
      } catch (err) {
        return `转换失败：${err?.message ?? String(err)}`
      }
    },
  }))

  // ──────────────────────────── acemusic_bridge ─────────────────────────────
  ctx.tools.register(defineTool({
    name: 'acemusic_tools',
    description: '列出并启用 ACE Music 的全部远端工具（登录后调用一次即可把 create_song、list_songs、download_song 等注册为 acemusic_* 工具）。',
    parameters: {},
    output: textOut(),
    async execute() {
      try {
        const tools = await bridgeTools()
        return `已启用 ${tools.length} 个 ACE Music 工具：\n${tools.map((t) => `- acemusic_${t.name}：${(t.description ?? '').split('\n')[0].slice(0, 80)}`).join('\n')}`
      } catch (err) {
        return `拉取远端工具失败：${err?.message ?? String(err)}`
      }
    },
  }))

  // ──────────────────────────── acemusic_call ───────────────────────────────
  ctx.tools.register(defineTool({
    name: 'acemusic_call',
    description: '直接调用任意 ACE Music 远端工具（兜底通道）。参数名用 name，参数体用 arguments（JSON 字符串或对象）。工具清单见 acemusic_tools。',
    parameters: {
      name: { type: 'string', required: true, description: '远端工具名，如 create_song、get_song、list_songs' },
      arguments: { type: 'json', description: '传给远端工具的参数对象，如 {"style":"city pop"}' },
    },
    output: textOut(),
    timeoutMs: CALL_TIMEOUT_MS,
    async execute(args) {
      let payload = args.arguments ?? {}
      if (typeof payload === 'string') {
        try { payload = payload.trim() ? JSON.parse(payload) : {} }
        catch (err) { return `arguments 不是合法 JSON：${err.message}` }
      }
      try {
        return renderToolResult(await mcp().callTool(args.name, payload))
      } catch (err) {
        return `调用 ${args.name} 失败：${err?.message ?? String(err)}`
      }
    },
  }))

  // 启动时如果已有令牌，后台补一次工具桥接（失败不影响插件激活）。
  if (credentials_usable()) {
    bridgeTools().catch(() => { /* 网络不通时下次调用再试 */ })
  }
}
