/**
 * 网络层：默认用标准 fetch 直连；只有直连在网络层失败（DNS 解析不了、
 * 连接建立不了）时，才回退到「自己解析 DNS + node:https」再试一次。
 *
 * 回退不是为了替代直连，而是一层兜底：某些 VPN / 分流配置会让系统
 * resolver（getaddrinfo）对单个域名返回 ENOTFOUND，而直连公共 DNS 仍然正常。
 * 正常网络下这段代码不会被执行。
 */
import dns from 'node:dns'
import https from 'node:https'

export const FORM = 'application/x-www-form-urlencoded'
export const JSON_CT = 'application/json'

const FALLBACK_DNS = ['8.8.8.8', '1.1.1.1', '223.5.5.5']
const CACHE_TTL = 300_000
let resolver = null
const cache = new Map()

function lookupWithFallback(hostname, options, cb) {
  if (typeof options === 'function') { cb = options; options = {} }
  if (!resolver) {
    resolver = new dns.promises.Resolver()
    resolver.setServers(FALLBACK_DNS)
  }
  const reply = (addrs) => {
    if (!addrs.length) return cb(Object.assign(new Error(`no address for ${hostname}`), { code: 'ENOTFOUND' }))
    if (options.all) return cb(null, addrs.map((address) => ({ address, family: 4 })))
    cb(null, addrs[0], 4)
  }
  const hit = cache.get(hostname)
  if (hit && Date.now() - hit.at < CACHE_TTL) return reply(hit.addrs)
  resolver.resolve4(hostname)
    .then((addrs) => { cache.set(hostname, { addrs, at: Date.now() }); reply(addrs) })
    .catch((err) => cb(err))
}

/** 直连失败是否属于「网络层」问题——只有这类才值得回退。 */
function isTransportFailure(err) {
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError') return false
  const code = err?.cause?.code || err?.code
  return err?.name === 'TypeError' || ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(code)
}

async function viaFetch(url, { method, headers, body, timeout }) {
  const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeout) })
  const text = await res.text()
  const flat = {}
  res.headers.forEach((value, key) => { flat[key.toLowerCase()] = value })
  return { status: res.status, headers: flat, body: text }
}

function viaLookup(url, { method = 'GET', headers = {}, body, timeout }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method,
      headers,
      lookup: lookupWithFallback,
    }, (res) => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }))
    })
    req.on('error', reject)
    req.setTimeout(timeout, () => req.destroy(new Error(`timeout after ${timeout}ms: ${url}`)))
    if (body) req.write(body)
    req.end()
  })
}

/**
 * 单次请求，返回状态码、响应头与文本体。
 * @param {string} url
 * @param {{method?: string, headers?: object, body?: string, timeout?: number}} options
 */
export async function request(url, options = {}) {
  const opts = { method: 'GET', headers: {}, timeout: 30_000, ...options }
  try {
    return await viaFetch(url, opts)
  } catch (err) {
    if (!isTransportFailure(err)) throw err
    return viaLookup(url, opts)
  }
}

/** 指数退避重试；仅用于网络层抖动。 */
export async function withRetry(fn, { attempts = 4, base = 600 } = {}) {
  let last
  for (let i = 0; i < attempts; i += 1) {
    try { return await fn() }
    catch (err) {
      last = err
      if (err?.name === 'AbortError' || err?.name === 'TimeoutError') throw err
      await new Promise((r) => setTimeout(r, base * (i + 1)))
    }
  }
  throw last
}
