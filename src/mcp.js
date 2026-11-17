/**
 * 最小 MCP 客户端（Streamable HTTP + JSON-RPC 2.0）。
 *
 * 只实现工具桥接需要的四个方法：initialize / notifications/initialized /
 * tools/list / tools/call。响应可能是普通 JSON，也可能是 SSE（data: 行），
 * 两种都解析。会话头 Mcp-Session-Id 由 initialize 响应带回，后续请求带上。
 */
import { request, withRetry, JSON_CT } from './net.js'

const PROTOCOL = '2025-06-18'

export class McpClient {
  /**
   * @param {{url: string, token: () => Promise<string>, deps?: object}} options
   */
  constructor({ url, token, deps = {} }) {
    this.url = url
    this.getToken = token
    this.deps = deps
    this.sessionId = null
    this.nextId = 1
    this.serverInfo = null
  }

  async headers() {
    const h = {
      'Content-Type': JSON_CT,
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': PROTOCOL,
      Authorization: `Bearer ${await this.getToken()}`,
    }
    if (this.sessionId) h['Mcp-Session-Id'] = this.sessionId
    return h
  }

  /** 发一个 JSON-RPC 请求；id 省略表示通知。 */
  async rpc(method, params, { id, retry = true } = {}) {
    const send = async () => {
      const res = await request(this.url, {
        method: 'POST',
        headers: await this.headers(),
        body: JSON.stringify({ jsonrpc: '2.0', method, params, ...(id === undefined ? {} : { id }) }),
        timeout: this.timeoutMs ?? 30_000,
      }, this.deps)
      if (res.status === 401 || res.status === 403) {
        throw Object.assign(new Error('ACE Music 授权已失效，请重新登录'), { code: 'UNAUTHORIZED' })
      }
      const sid = res.headers['mcp-session-id']
      if (sid) this.sessionId = sid
      return res
    }
    const res = retry ? await withRetry(send, { label: method }) : await send()
    const payload = parsePayload(res, id)
    if (payload && payload.error) {
      throw Object.assign(new Error(`${method} 失败：${payload.error.message || JSON.stringify(payload.error)}`), {
        code: 'MCP_ERROR',
        detail: payload.error,
      })
    }
    return payload
  }

  async connect() {
    if (this.connected) return this
    const init = await this.rpc('initialize', {
      protocolVersion: PROTOCOL,
      capabilities: {},
      clientInfo: { name: 'dsh-ace-music', version: '0.1.0' },
    }, { id: this.nextId++ })
    this.serverInfo = init?.result?.serverInfo ?? null
    this.instructions = init?.result?.instructions ?? ''
    try {
      await this.rpc('notifications/initialized', undefined, { retry: false })
    } catch { /* 通知失败不影响后续调用 */ }
    this.connected = true
    return this
  }

  async listTools() {
    await this.connect()
    const out = []
    let cursor
    for (let page = 0; page < 20; page += 1) {
      const res = await this.rpc('tools/list', cursor ? { cursor } : {}, { id: this.nextId++ })
      const tools = res?.result?.tools ?? []
      out.push(...tools)
      cursor = res?.result?.nextCursor
      if (!cursor) break
    }
    return out
  }

  async callTool(name, args = {}) {
    await this.connect()
    const res = await this.rpc('tools/call', { name, arguments: args }, { id: this.nextId++ })
    return res?.result ?? { isError: true, content: [{ type: 'text', text: '远端没有返回结果' }] }
  }

  reset() {
    this.connected = false
    this.sessionId = null
  }
}

/** 从响应里取出 JSON-RPC 对象；兼容 SSE 与普通 JSON。 */
export function parsePayload(res, id) {
  const ct = (res.headers['content-type'] || '').toLowerCase()
  if (ct.includes('text/event-stream')) {
    for (const line of res.body.split('\n')) {
      if (!line.startsWith('data:')) continue
      try {
        const obj = JSON.parse(line.slice(5).trim())
        if (id === undefined || obj.id === id) return obj
      } catch { /* 跳过非 JSON 的 data 行 */ }
    }
    return null
  }
  try { return JSON.parse(res.body) } catch { return null }
}

/**
 * 把 MCP 的 tools/call 结果摊平成一段可读文本。
 * 图片/音频等非文本块保留类型与地址，不吞掉。
 */
export function renderToolResult(result) {
  if (!result) return '(空结果)'
  const lines = []
  for (const block of result.content ?? []) {
    if (!block || typeof block !== 'object') continue
    if (block.type === 'text' && typeof block.text === 'string') {
      lines.push(block.text)
    } else if (block.type === 'image') {
      lines.push(`[图片 ${block.mimeType ?? ''}]`)
    } else if (block.type === 'audio') {
      lines.push(`[音频 ${block.mimeType ?? ''}]`)
    } else if (block.type === 'resource' && block.resource) {
      const r = block.resource
      lines.push(`[资源 ${r.uri ?? ''}]${r.text ? `\n${r.text}` : ''}`)
    } else if (block.type === 'resource_link') {
      lines.push(`[链接 ${block.name ?? ''} ${block.uri ?? ''}]`)
    } else {
      lines.push(`[${block.type ?? 'unknown'} 内容已省略]`)
    }
  }
  if (result.structuredContent) {
    lines.push(`\n结构化结果：\n${JSON.stringify(result.structuredContent, null, 2)}`)
  }
  const text = lines.join('\n').trim()
  return text || '(空结果)'
}
