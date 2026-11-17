/**
 * ACE Music 的 OAuth 2.0 授权（authorization code + PKCE + 动态客户端注册）。
 *
 * 这个部署里 DSH 自带的 MCP 客户端只支持静态请求头，不处理 401 的 OAuth 挑战，
 * 而 acemusic.ai/mcp 只认 OAuth —— 所以授权流程由插件自己完成，再把 Bearer
 * 令牌交给 MCP 客户端。
 *
 * 端点来自 https://acemusic.ai/.well-known/oauth-authorization-server。
 */
import crypto from 'node:crypto'
import { createServer } from 'node:http'
import { request, withRetry, FORM, JSON_CT } from './net.js'

export const OAUTH = {
  resource: 'https://acemusic.ai/mcp',
  register: 'https://acemusic.ai/oauth/register',
  authorize: 'https://acemusic.ai/oauth/authorize',
  token: 'https://acemusic.ai/oauth/token',
  scope: 'songs:read songs:create',
  clientName: 'DeepSeek Harness (ACE Music plugin)',
}

export const b64u = (buf) => Buffer.from(buf).toString('base64url')

/** 新注册一个 OAuth 客户端；redirectUri 必须在注册时声明。 */
export async function registerClient(redirectUri, deps = {}) {
  const body = JSON.stringify({
    client_name: OAUTH.clientName,
    redirect_uris: [redirectUri],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: OAUTH.scope,
  })
  const res = await withRetry(() => request(OAUTH.register, {
    method: 'POST',
    headers: { 'Content-Type': JSON_CT },
    body,
  }, deps), { label: 'register' })
  const json = JSON.parse(res.body)
  if (!json.client_id) throw new Error(`客户端注册失败：${res.body.slice(0, 200)}`)
  return json.client_id
}

/** 生成一次授权尝试所需的全部材料。 */
export function beginAuthorization(clientId, redirectUri) {
  const verifier = b64u(crypto.randomBytes(48))
  const challenge = b64u(crypto.createHash('sha256').update(verifier).digest())
  const state = b64u(crypto.randomBytes(16))
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    scope: OAUTH.scope,
  })
  return { verifier, challenge, state, url: `${OAUTH.authorize}?${q}` }
}

/**
 * 起一个只监听回环地址的一次性回调服务。
 * @returns {Promise<{redirectUri: string, waitForCode: (ms: number) => Promise<string>, close: () => void}>}
 */
export function startCallbackServer(port) {
  return new Promise((resolve, reject) => {
    let settle
    const waiting = new Promise((res, rej) => { settle = { res, rej } })
    const server = createServer((req, res) => {
      const u = new URL(req.url, `http://127.0.0.1:${port}`)
      if (u.pathname !== '/callback') { res.writeHead(404); res.end('not found'); return }
      const code = u.searchParams.get('code')
      const err = u.searchParams.get('error')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      if (err || !code) {
        res.end(`<h2>ACE Music 授权失败</h2><pre>${err || 'missing code'}</pre>`)
        settle.rej(new Error(`授权被拒绝：${err || 'missing code'}`))
        return
      }
      res.end('<h2>ACE Music 授权成功</h2><p>可以关闭此页面，回到 DeepSeek Harness。</p>')
      settle.res(code)
    })
    server.on('error', reject)
    server.listen(port, '127.0.0.1', () => {
      resolve({
        redirectUri: `http://127.0.0.1:${port}/callback`,
        waitForCode: (ms) => Promise.race([
          waiting,
          new Promise((_, rej) => setTimeout(() => rej(new Error(`授权超时（${Math.round(ms / 1000)} 秒内未完成）`)), ms)),
        ]),
        close: () => new Promise((r) => server.close(() => r())),
      })
    })
  })
}

/** 用授权码换令牌。 */
export async function exchangeCode({ code, clientId, verifier, redirectUri }, deps = {}) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
  }).toString()
  const res = await withRetry(() => request(OAUTH.token, {
    method: 'POST',
    headers: { 'Content-Type': FORM },
    body,
  }, deps), { label: 'token' })
  const json = JSON.parse(res.body)
  if (!json.access_token) throw new Error(`换取令牌失败：${res.body.slice(0, 200)}`)
  return json
}

/** 用 refresh_token 续期。 */
export async function refreshToken({ refreshToken: rt, clientId }, deps = {}) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: rt,
    client_id: clientId,
  }).toString()
  const res = await withRetry(() => request(OAUTH.token, {
    method: 'POST',
    headers: { 'Content-Type': FORM },
    body,
  }, deps), { label: 'refresh' })
  const json = JSON.parse(res.body)
  if (!json.access_token) throw new Error(`刷新令牌失败：${res.body.slice(0, 200)}`)
  return json
}
