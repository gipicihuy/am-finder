import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const BROWSER_HEADERS = [
  'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language: en-US,en;q=0.9'
]
const API_HEADERS = [
  'Accept: application/json, text/plain, */*',
  'Accept-Language: en-US,en;q=0.9',
  'Referer: https://www.tiktok.com/search?q=preset',
  'sec-fetch-dest: empty',
  'sec-fetch-mode: cors',
  'sec-fetch-site: same-origin'
]

let logSink = (line) => {
  try { process.stderr.write(line + '\n') } catch {}
}

function setLog (fn) {
  logSink = typeof fn === 'function' ? fn : () => {}
}

function log (...args) {
  try { logSink(args.join(' ')) } catch {}
}

function decodeEntities (s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
}

function stripTags (s) {
  return decodeEntities(s.replace(/<[^>]*>/g, ' '))
    .replace(/<[^<>]*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function shuffle (arr) {
  const r = arr.slice()
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

async function curlText (url, opts = {}) {
  const timeout = opts.timeout || 20000
  const bin = process.env.CURL_PATH || 'curl'
  const args = [
    '-s', '-L', '--compressed',
    '-m', String(Math.max(3, Math.ceil(timeout / 1000))),
    '-A', UA
  ]
  for (const h of opts.headers || []) args.push('-H', h)
  if (opts.jar) args.push('-b', opts.jar, '-c', opts.jar)
  if (opts.hdrFile) args.push('-D', opts.hdrFile)
  args.push('--write-out', '\n%{http_code}', url)
  const out = await new Promise((resolve, reject) => {
    let buf = ''
    let err = ''
    const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const timer = setTimeout(() => {
      p.kill('SIGKILL')
      reject(new Error('timeout request'))
    }, timeout + 5000)
    p.on('error', (e) => {
      clearTimeout(timer)
      reject(e.code === 'ENOENT' ? Object.assign(new Error('NO_CURL'), { noCurl: true }) : e)
    })
    p.stdout.on('data', (d) => (buf += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0 && !buf) return reject(new Error(err.trim().split('\n').pop() || `curl exit ${code}`))
      resolve(buf)
    })
  }).catch(async (e) => {
    if (!e.noCurl) throw e
    log('[search] curl tidak ada, pakai fetch bawaan node (bisa kena blokir)')
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, ...(opts.headers || []).reduce((o, h) => {
        const i = h.indexOf(':')
        if (i > 0) o[h.slice(0, i).trim()] = h.slice(i + 1).trim()
        return o
      }, {}) },
      signal: AbortSignal.timeout(timeout)
    })
    return `${await r.text()}\n${r.status}`
  })
  const cut = out.lastIndexOf('\n')
  const status = Number(out.slice(cut + 1)) || 0
  const body = cut >= 0 ? out.slice(0, cut) : out
  return { status, body }
}

function fetchHtml (url, timeout) {
  return curlText(url, { timeout, headers: BROWSER_HEADERS })
}

function extractTiktokUrls (html) {
  const re = /https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9._]+\/(?:video|photo)\/\d+|https?:\/\/vt\.tiktok\.com\/[A-Za-z0-9]+/g
  return [...new Set(html.match(re) || [])]
}

function normalizeUrl (u) {
  return u.replace(/^http:/, 'https:').replace('//m.tiktok.com', '//www.tiktok.com')
}

function itemFromUrl (url, snippet) {
  const handle = (url.match(/tiktok\.com\/(@[A-Za-z0-9._]+)/) || [])[1] || ''
  const kind = (url.match(/\/(video|photo)\//) || [])[1] || (url.includes('vt.tiktok.com') ? 'short' : '')
  return { url: normalizeUrl(url), handle, kind, snippet: String(snippet || '').slice(0, 180) }
}

function parseBrave (html, limit) {
  const parts = html.split(/class="snippet[ "]/).slice(1)
  const out = []
  const seen = new Set()
  for (const p of parts) {
    if (out.length >= limit) break
    const m = p.match(/href="(https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9._]+\/(?:video|photo)\/\d+)"/) ||
      p.match(/href="(https?:\/\/vt\.tiktok\.com\/[A-Za-z0-9]+)"/)
    if (!m) continue
    const url = normalizeUrl(m[1])
    if (seen.has(url)) continue
    seen.add(url)
    const body = p.slice(p.indexOf('>') + 1)
    const txt = stripTags(body.slice(0, 4000))
      .replace(/^TikTok\s+/i, '')
      .replace(/^(?:www\.)?tiktok\.com\s*›\s*/i, '')
      .replace(/^@\S+\s*›\s*video\s*›\s*\d+\s*/i, '')
      .replace(/^tiktok\s*›\s*/i, '')
    const it = itemFromUrl(url, txt)
    const img = p.match(/<img[^>]+(?:data-src|src)="(https?:[^"]+)"/)
    if (img) it.thumb = img[1].replace(/&amp;/g, '&')
    out.push(it)
  }
  return out
}

function parseSearx (html, limit) {
  const out = []
  const seen = new Set()
  const push = (url, snippet) => {
    const it = itemFromUrl(url, snippet)
    if (seen.has(it.url)) return
    seen.add(it.url)
    out.push(it)
  }
  const parts = html.split(/class="result[\s"]/).slice(1)
  for (const p of parts) {
    if (out.length >= limit) break
    const m = p.match(/href="(https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9._]+\/(?:video|photo)\/\d+)"/) ||
      p.match(/href="(https?:\/\/vt\.tiktok\.com\/[A-Za-z0-9]+)"/)
    if (!m) continue
    const content = p.match(/<p class="content">([\s\S]*?)<\/p>/)
    push(m[1], content ? stripTags(content[1]) : '')
    const img = p.match(/<img[^>]+(?:data-src|src)="(https?:[^"]+)"/)
    if (img && out.length) out[out.length - 1].thumb = img[1].replace(/&amp;/g, '&')
  }
  if (!out.length) {
    for (const u of extractTiktokUrls(html)) {
      if (out.length >= limit) break
      push(u, '')
    }
  }
  return out.slice(0, limit)
}

function parseTikTokJson (body, limit) {
  let j
  try { j = JSON.parse(body) } catch { return [] }
  const out = []
  const seen = new Set()
  const walk = (n) => {
    if (out.length >= limit * 2) return
    if (Array.isArray(n)) { for (const x of n) walk(x); return }
    if (!n || typeof n !== 'object') return
    const id = n.id ?? n.aweme_id
    const handle = n.author?.unique_id || n.authorInfo?.unique_id || n.author?.uniqueId
    if (id && handle && /^\d{14,20}$/.test(String(id))) {
      const kind = (n.media_type === 2 || n.image_post_info || n.item_type === 'image') ? 'photo' : 'video'
      const url = `https://www.tiktok.com/@${handle}/${kind}/${id}`
      if (!seen.has(url)) {
        seen.add(url)
        out.push({ url, handle: '@' + handle, kind, snippet: String(n.desc || n.title || '').slice(0, 180) })
      }
    }
    for (const v of Object.values(n)) if (v && typeof v === 'object') walk(v)
  }
  walk(j)
  return out.slice(0, limit)
}

const CACHE_FILE = '/tmp/ttsearch.cache.json'
const CACHE_TTL = 6 * 60 * 60 * 1000
const STALE_TTL = 7 * 24 * 60 * 60 * 1000
const META_KEY = '__meta__'
const INST_URL = 'https://searx.space/data/instances.json'
const BRAVE_COOLDOWN = 10 * 60 * 1000

function loadCache () {
  try {
    if (!existsSync(CACHE_FILE)) return {}
    const c = JSON.parse(readFileSync(CACHE_FILE, 'utf8'))
    return c && typeof c === 'object' ? c : {}
  } catch { return {} }
}

function writeCache (c) {
  try { writeFileSync(CACHE_FILE, JSON.stringify(c, null, 2)) } catch {}
}

function getMeta () {
  const m = loadCache()[META_KEY]
  return m && typeof m === 'object' ? m : {}
}

function setMeta (patch) {
  const c = loadCache()
  c[META_KEY] = { ...(c[META_KEY] || {}), ...patch }
  writeCache(c)
}

function saveCacheEntry (query, items) {
  const c = loadCache()
  c[query.trim().toLowerCase()] = { t: Date.now(), items }
  writeCache(c)
}

function cachedResult (query, opts, maxAge) {
  const hit = loadCache()[query.trim().toLowerCase()]
  if (!hit?.items?.length) return null
  const age = Date.now() - hit.t
  if (age > maxAge) return null
  return {
    items: hit.items.slice(0, opts.limit),
    ageMin: Math.round(age / 60000)
  }
}

const TIKWM = 'https://www.tikwm.com'
const TIKWM_HEADERS = {
  'user-agent': UA,
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  referer: 'https://www.tikwm.com/',
  origin: 'https://www.tikwm.com'
}

async function searchTikwm (query, opts) {
  const out = []
  const seen = new Set()
  let cursor = 0
  let lastErr = ''
  const max = Math.min(opts.limit, 30)
  while (out.length < max && cursor < 90) {
    const u = TIKWM + '/api/feed/search/?' + new URLSearchParams({
      keywords: query, count: '30', cursor: String(cursor), HD: '1'
    })
    let d = null
    for (let i = 0; i < 3 && !d; i++) {
      try {
        const r = await fetch(u, { headers: TIKWM_HEADERS, signal: AbortSignal.timeout(Math.min(opts.timeout, 20000)) })
        const txt = await r.text()
        if (r.status === 200 && txt.trim().startsWith('{')) {
          const j = JSON.parse(txt)
          if (j.code === 0) d = j.data
          else lastErr = j.msg || 'code ' + j.code
        } else lastErr = 'HTTP ' + r.status
      } catch (e) { lastErr = e.message }
      if (!d) await new Promise((r) => setTimeout(r, 700 * (i + 1)))
    }
    if (!d) break
    const vids = d.videos || []
    if (!vids.length) break
    for (const v of vids) {
      const id = v.video_id || v.id
      if (!id || seen.has(id)) continue
      seen.add(id)
      const isPhoto = (v.images || []).length > 0
      const handle = v.author?.unique_id || ''
      if (!handle) continue
      out.push({
        url: 'https://www.tiktok.com/@' + handle + '/' + (isPhoto ? 'photo' : 'video') + '/' + id,
        handle: '@' + handle,
        kind: isPhoto ? 'photo' : 'video',
        snippet: String(v.title || '').split('\n')[0].slice(0, 180),
        thumb: v.cover || v.origin_cover || (v.images || [])[0] || '',
        duration: Number(v.duration) || 0,
        stats: { playCount: v.play_count || 0, likeCount: v.digg_count || 0 }
      })
      if (out.length >= max) break
    }
    cursor += 30
    if (out.length < max) await new Promise((r) => setTimeout(r, 900))
  }
  if (!out.length) throw new Error(lastErr || 'tikwm tidak punya hasil untuk keyword ini')
  log(`[tikwm] ${out.length} video ketemu`)
  return { pageUrl: TIKWM + '/api/feed/search/?keywords=' + encodeURIComponent(query), items: out.slice(0, max) }
}

async function searchBrave (query, opts) {
  const tries = [
    `site:tiktok.com ${query}`,
    `${query} tiktok alight motion`
  ]
  let lastErr = ''
  for (const q of tries) {
    const url = `https://search.brave.com/search?q=${encodeURIComponent(q)}`
    log(`[brave] "${q}"`)
    let r
    try {
      r = await fetchHtml(url, opts.timeout)
    } catch (e) {
      lastErr = e.message
      log(`[brave] request gagal: ${e.message}`)
      continue
    }
    if (r.status === 429 || r.status === 503) {
      setMeta({ braveUntil: Date.now() + BRAVE_COOLDOWN })
      throw Object.assign(new Error(`rate limit Brave (${r.status})`), { limited: true })
    }
    const blocked = r.status !== 200 ||
      /unusual traffic|are you a robot|captcha/i.test(r.body.slice(0, 20000))
    if (blocked) {
      lastErr = `status ${r.status} (diblokir)`
      log(`[brave] diblokir (${lastErr})`)
      continue
    }
    const items = parseBrave(r.body, opts.limit)
    log(`[brave] ${items.length} video ketemu`)
    if (items.length) return { pageUrl: url, items }
    lastErr = 'tidak ada hasil tiktok di halaman hasil'
  }
  throw new Error(lastErr || 'brave gagal')
}

async function searxPool (opts) {
  const meta = getMeta()
  let list = Array.isArray(meta.instances) ? meta.instances : []
  const age = Date.now() - (meta.instancesAt || 0)
  if (!list.length || age > 24 * 60 * 60 * 1000) {
    try {
      const r = await curlText(INST_URL, { timeout: Math.min(opts.timeout, 15000) })
      const j = JSON.parse(r.body)
      const fresh = Object.entries(j.instances || {})
        .filter(([, v]) => v.network_type === 'normal' && (!v.http?.status_code || v.http.status_code < 400))
        .map(([u]) => String(u).replace(/\/$/, ''))
        .filter((u) => /^https:\/\//.test(u))
      if (fresh.length) {
        list = fresh
        setMeta({ instances: fresh, instancesAt: Date.now() })
        log(`[searx] daftar instance: ${fresh.length}`)
      }
    } catch (e) {
      log(`[searx] gagal ambil daftar instance: ${e.message}`)
    }
  }
  const good = (getMeta().goodInstances || []).filter((h) => typeof h === 'string' && !isBadInstance(h))
  const rest = list.filter((h) => !good.includes(h) && !isBadInstance(h))
  return [...shuffle(good), ...shuffle(rest)]
}

async function searchSearx (query, opts) {
  const pool = await searxPool(opts)
  if (!pool.length) throw new Error('daftar instance kosong')
  const tries = [`site:tiktok.com inurl:video ${query}`, `site:tiktok.com ${query}`]
  let attempts = 0
  let lastErr = ''
  outer:
  for (const q of tries) {
    for (const host of pool) {
      if (attempts >= 3) break outer
      attempts++
      if (attempts > 1) await new Promise((r) => setTimeout(r, 400))
      const url = `${host}/search?q=${encodeURIComponent(q)}`
      let r
      try {
        r = await curlText(url, {
          timeout: Math.min(opts.timeout, 6000),
          headers: BROWSER_HEADERS
        })
      } catch (e) {
        markBadInstance(host, 30 * 60 * 1000)
        lastErr = `${host} ${e.message}`
        continue
      }
      if (r.status === 429 || r.status === 403 || r.status === 0) {
        markBadInstance(host, 30 * 60 * 1000)
        lastErr = `${host} ${r.status || 'mati'}`
        continue
      }
      if (r.status !== 200) { markBadInstance(host, 30 * 60 * 1000); lastErr = `${host} status ${r.status}`; continue }
      const items = parseSearx(r.body, opts.limit)
      if (items.length) {
        log(`[searx] ${host} -> ${items.length} video`)
        rememberGoodInstance(host)
        return { pageUrl: url, items }
      }
      markBadInstance(host, 10 * 60 * 1000)
      lastErr = `${host} tanpa hasil`
    }
  }
  throw new Error(lastErr || 'searx gagal')
}

function markBadInstance (host, ms) {
  const bad = { ...(getMeta().badInstances || {}) }
  bad[host] = Date.now() + ms
  setMeta({ badInstances: bad })
}

function isBadInstance (host) {
  const bad = getMeta().badInstances || {}
  return (bad[host] || 0) > Date.now()
}

function rememberGoodInstance (host) {
  const good = (getMeta().goodInstances || []).filter((h) => h !== host)
  good.unshift(host)
  setMeta({ goodInstances: good.slice(0, 20) })
}

let SIGNER = 'unknown'
function engineOrder (opts) {
  if (opts.engine && opts.engine !== 'auto') return [opts.engine]
  return ['tikwm', 'brave', 'searx']
}

async function searchTiktok (query, opts) {
  if (process.env.TT_HTML_FILE) {
    const html = readFileSync(process.env.TT_HTML_FILE, 'utf8')
    const items = (html.includes('class="snippet') ? parseBrave(html, opts.limit) : parseSearx(html, opts.limit))
    log(`[debug] parse ${process.env.TT_HTML_FILE} -> ${items.length} video`)
    return { pageUrl: `file://${process.env.TT_HTML_FILE}`, items, engine: 'file' }
  }
  const fresh = opts.refresh ? null : cachedResult(query, opts, CACHE_TTL)
  if (fresh) {
    log(`[cache] pakai hasil simpanan (${fresh.ageMin} menit lalu)`)
    return { pageUrl: 'cache', items: fresh.items, fromCache: true, engine: 'cache' }
  }

  const order = engineOrder(opts)
  const tried = []
  const errs = []
  for (const name of order) {
    const meta = getMeta()
    if (name === 'brave' && opts.engine === 'auto' && meta.braveUntil && Date.now() < meta.braveUntil) {
      const sisa = Math.ceil((meta.braveUntil - Date.now()) / 60000)
      log(`[brave] masih cooldown ${sisa} menit, lompat ke engine berikutnya`)
      tried.push({ engine: 'brave', ok: false, note: `cooldown ${sisa}m` })
      continue
    }
    try {
      const fn = name === 'tikwm' ? searchTikwm
        : name === 'brave' ? searchBrave
          : searchSearx
      const res = await fn(query, opts)
      res.tried = tried.concat({ engine: name, ok: true, note: `${res.items.length} hasil` })
      res.engine = name
      return res
    } catch (e) {
      log(`[${name}] gagal: ${e.message}`)
      tried.push({ engine: name, ok: false, note: e.message })
      errs.push(`${name}: ${e.message}`)
    }
  }

  const old = cachedResult(query, opts, STALE_TTL)
  if (old) {
    log(`[cache] semua engine gagal -> pakai hasil simpanan (${old.ageMin} menit lalu)`)
    return { pageUrl: 'cache', items: old.items, fromCache: true, engine: 'cache', tried }
  }
  throw new Error(`pencarian gagal: ${errs.join(' | ')}`)
}


export { searchTiktok, setLog }
