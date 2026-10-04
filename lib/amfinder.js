import { setTimeout as sleep } from 'node:timers/promises'
import { readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

const AM_HOSTS = [
  'alight.link',
  'alight.to',
  'alight.page.link',
  'alightcreative.page.link',
  'alightmotion.page.link'
]

const AM_SHARE_RE = /alightcreative\.com\/am\/share\//i

const FILE_HOSTS = [
  'drive.google.com',
  'docs.google.com',
  'drive.usercontent.google.com',
  'mediafire.com',
  'dropbox.com',
  'mega.nz',
  'sfile.mobi',
  'wetransfer.com',
  'apkdownload',
  'github.com',
  'gitlab.com'
]

const SOCIAL_HOSTS = [
  'tiktok.com',
  'instagram.com',
  'facebook.com',
  'youtube.com',
  'twitter.com',
  'x.com',
  't.me',
  'telegram.me',
  'wa.me',
  'whatsapp.com',
  'lynk.id',
  'linktr.ee',
  'bio.link',
  'heylink.me',
  'stan.store',
  's.id',
  'soc12.my.id'
]

const LINKTREE_HOSTS = [
  'lynk.id',
  'linktr.ee',
  'bio.link',
  'heylink.me',
  'about.me',
  'stan.store',
  's.id',
  'cutt.ly',
  'bit.ly',
  'tinyurl.com',
  'linktree.com',
  'taplink.cc',
  'soc12.my.id'
]

const URL_RE =
  /https?:\/\/[^\s"'<>()[\]{}\\]+/gi

const T0 = Date.now()
const log = (...a) =>
  process.stderr.write(`[${((Date.now() - T0) / 1000).toFixed(1)}s] ` + a.join(' ') + '\n')

function cleanUrl(u) {
  if (!u) return null
  let s = u.replace(/[.,;:!?)'"»”]+$/, '')
  s = s.replace(/&amp;/g, '&')
  return s
}

function decodeEntities(str) {
  if (!str) return str
  let out = String(str)
  out = out.replace(/&#x([0-9a-f]+);/gi, (m, h) => {
    try { return String.fromCodePoint(parseInt(h, 16)) } catch { return m }
  })
  out = out.replace(/&#(\d+);/g, (m, d) => {
    try { return String.fromCodePoint(Number(d)) } catch { return m }
  })
  out = out
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
  return out
}

function normalizeLinks(text) {
  return String(text || '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '')
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
    .replace(/\b(https?)(?:\s*[:：]\s*|\s+)?\/{1,2}/gi, '$1://')
}

function extractLinks(text) {
  if (!text) return []
  const flat = normalizeLinks(text)
  const out = new Set()
  for (const m of flat.matchAll(URL_RE)) {
    const u = cleanUrl(m[0])
    if (u) out.add(u)
  }
  for (const m of flat.matchAll(
    /(?:^|[\s({[>])((?:www\.)?(?:alight\.(?:link|to)\/[A-Za-z0-9_-]+|alightcreative\.com\/am\/share\/[^\s"'<>]+))/gi
  )) {
    out.add(cleanUrl('https://' + m[1]))
  }
  return [...out]
}

const CONTEXT_CORE = [
  'presetalightmotion',
  'alightmotionpreset',
  'presetdibawah5mb',
  'presetxml',
  'preset5mb',
  'alightmotion',
  'ampreset',
  'amedit',
  'alightmotiontutorial',
  'alightmotionedits',
  'alightmotionpro'
]

const CONTEXT_SUPPORT = ['preset', '5mb', 'velocity', 'jedagjedug', 'jedugalighmotion', 'amprem']

function videoContext(...parts) {
  const raw = parts
    .filter(Boolean)
    .join('\n')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
  const hay = raw.replace(/[#@]/g, ' ').replace(/[\s_-]+/g, '')
  const has = k => hay.includes(k)
  const core = CONTEXT_CORE.filter(has)
  const support = CONTEXT_SUPPORT.filter(has)
  const level = core.length ? 'core' : support.length ? 'support' : 'none'
  return { level, matched: [...new Set([...core, ...support])].slice(0, 8) }
}

async function http(url, opts = {}) {
  const res = await fetch(url, {
    redirect: opts.redirect || 'follow',
    headers: {
      'User-Agent': opts.ua || UA,
      Accept: opts.accept || 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: opts.referer || 'https://www.tiktok.com/'
    },
    signal: AbortSignal.timeout(opts.timeout || 20000)
  })
  return res
}

async function curlText(url, opts = {}) {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const run = promisify(execFile)
  try {
    const { stdout } = await run(
      'curl',
      [
        '-sSL',
        '--max-time',
        String(Math.floor((opts.timeout || 20000) / 1000)),
        '-A',
        opts.ua || UA,
        '-H',
        'Accept-Language: en-US,en;q=0.9',
        '-H',
        `Referer: ${opts.referer || 'https://www.tiktok.com/'}`,
        url
      ],
      { maxBuffer: 12 * 1024 * 1024 }
    )
    return stdout
  } catch {
    return null
  }
}

async function text(url, opts = {}) {
  try {
    const res = await http(url, opts)
    const body = await res.text()
    if (!opts.noFallback && (res.status === 403 || res.status === 401 || res.status === 429)) {
      const fallback = await curlText(url, opts)
      if (fallback) return { status: res.status, body: fallback, fallback: true }
    }
    return { status: res.status, body }
  } catch (e) {
    if (opts.noFallback) throw e
    const fallback = await curlText(url, opts)
    if (fallback) return { status: 200, body: fallback, fallback: true }
    throw e
  }
}

async function resolveChain(url, max = 8) {
  let cur = url
  const chain = []
  const amFound = []
  let lastHttp = url

  const note = u => {
    if (!u) return
    const s = String(u)
    const m = s.match(/https?:\/\/alightcreative\.com\/am\/share\/[^\s"'<>;]+/i)
    if (m) {
      amFound.push(m[0])
      return
    }
    if (/^https?:/i.test(s) && hostIn(s, AM_HOSTS)) amFound.push(s.split(/[?#]/)[0])
  }

  note(url)

  for (let i = 0; i < max; i++) {
    let res
    try {
      res = await http(cur, { redirect: 'manual', timeout: 12000 })
    } catch {
      break
    }
    if (res.status >= 300 && res.status < 400) {
      let loc = res.headers.get('location')
      if (!loc) break
      if (loc.startsWith('intent://')) {
        const decoded = decodeURIComponent(loc)
        note(decoded)
        const embedded = decoded.match(
          /https?:\/\/alightcreative\.com\/am\/share\/[^\s"'<>;]+/i
        )
        loc = embedded ? embedded[0] : null
        if (!loc) break
      }
      if (!/^https?:/i.test(loc)) break
      cur = new URL(loc, cur).href
      chain.push(cur)
      note(cur)
      if (AM_SHARE_RE.test(cur)) {
        lastHttp = cur
        break
      }
      continue
    }
    lastHttp = cur
    note(cur)
    break
  }

  note(lastHttp)
  const share = amFound.find(x => AM_SHARE_RE.test(x))
  const amUrl = share || amFound[amFound.length - 1] || null
  return { finalUrl: lastHttp, amUrl, chain }
}

function hostOf(u) {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

function hostIn(u, list) {
  const h = hostOf(u)
  if (!h) return false
  return list.some(x => h === x || h.endsWith('.' + x))
}

function isAmUrl(u) {
  if (!u) return false
  if (AM_SHARE_RE.test(u)) return true
  return hostIn(u, AM_HOSTS)
}

function isFileUrl(u) {
  if (hostIn(u, FILE_HOSTS)) return true
  return /\.(xml|zip|ampreset|json)(\?|$)/i.test(u)
}

function isSocialUrl(u) {
  return hostIn(u, SOCIAL_HOSTS)
}

function isLinktree(u) {
  return hostIn(u, LINKTREE_HOSTS)
}

function isNoiseUrl(u) {
  const h = hostOf(u)
  if (h.includes('tiktokcdn') || h.endsWith('.ttwstatic.com') || h.endsWith('.tiktokv.com')) {
    return true
  }
  if (/\.(png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|mp4|mp3|css|js|mjs)(\?|$)/i.test(u)) {
    return true
  }
  if (/^https?:\/\/(apis|static|img|images|assets|sf16|lf16|sf6|lf6)\./i.test(u)) return true
  return hostIn(u, [
    'ttwstatic.com',
    'tiktokv.com',
    'tiktokcdn.com',
    'tiktok.com',
    'snssdk.com',
    'bytedance.com',
    'byteimg.com',
    'googleapis.com',
    'gstatic.com',
    'google-analytics.com',
    'doubleclick.net',
    'facebook.net',
    'fbcdn.net',
    'apple.com',
    'w3.org',
    'schema.org',
    'cloudflare.com',
    'jsdelivr.net',
    'unpkg.com',
    'socket.io',
    'amazonaws.com',
    'appsflyer.com',
    'branch.io',
    'sentry.io',
    'newrelic.com',
    'crashlytics.com'
  ])
}

function extractVideoId(input) {
  const s = String(input).trim()
  if (/^\d{15,}$/.test(s)) return s
  const pats = [
    /\/video\/(\d{15,})/,
    /\/v\/(\d{15,})/,
    /\/share\/video\/(\d{15,})/,
    /[?&](?:item_id|share_item_id|aweme_id)=(\d{15,})/,
    /\/(\d{15,})(?:\?|$)/
  ]
  for (const p of pats) {
    const m = s.match(p)
    if (m) return m[1]
  }
  return null
}

async function resolveTiktokUrl(input) {
  const direct = extractVideoId(input)
  if (/^https?:\/\//i.test(input) === false && direct) {
    return { videoId: direct, canonical: null }
  }
  let start = input
  if (!/^https?:\/\//i.test(start)) start = 'https://' + start
  let cur = start
  for (let i = 0; i < 6; i++) {
    const id = extractVideoId(cur)
    if (id && /tiktok\.com/i.test(cur)) {
      const m = cur.match(/\/@([^/?#]+)\//)
      return { videoId: id, canonical: m ? `https://www.tiktok.com/@${m[1]}/video/${id}` : null }
    }
    let res
    try {
      res = await http(cur, { redirect: 'manual', timeout: 15000 })
    } catch {
      break
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) break
      cur = new URL(loc, cur).href
      continue
    }
    const id2 = extractVideoId(cur)
    if (id2) {
      const m = cur.match(/\/@([^/?#]+)\//)
      return { videoId: id2, canonical: m ? `https://www.tiktok.com/@${m[1]}/video/${id2}` : null }
    }
    break
  }
  const fallbackId = extractVideoId(cur) || direct
  if (!fallbackId) throw new Error('gagal resolve video id dari url')
  const m2 = String(cur).match(/\/@([^/?#]+)\//)
  return {
    videoId: fallbackId,
    canonical: m2 ? `https://www.tiktok.com/@${m2[1]}/video/${fallbackId}` : null
  }
}

function parseFrontity(html) {
  const m = html.match(
    /<script[^>]*id="__FRONTITY_CONNECT_STATE__"[^>]*>([\s\S]*?)<\/script>/
  )
  if (!m) return null
  try {
    return JSON.parse(m[1])
  } catch {
    return null
  }
}

async function getCleanPlayUrl(url) {
  if (!url) return null
  try {
    const res = await http(`https://tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`, {
      timeout: 7000,
      referer: 'https://tikwm.com/'
    })
    if (!res.ok) return null
    const j = await res.json()
    if (j?.code !== 0 || !j.data?.play) return null
    const play = j.data.play
    if (!/^https:\/\//.test(play)) return null
    log('      play tanpa watermark: ok')
    return play
  } catch (e) {
    log('      play tanpa watermark: lewat')
    return null
  }
}

async function getVideoInfo(videoId, attempts = 2) {
  let lastError = 'embed gagal'
  for (let i = 0; i < attempts; i++) {
    if (i) await sleep(700)
    let res
    try {
      res = await text(`https://www.tiktok.com/embed/v2/${videoId}`, {
        accept: 'text/html,application/json',
        timeout: 7000,
        noFallback: true
      })
    } catch (e) {
      lastError = `embed timeout (${e.name || e.message})`
      continue
    }
    const st = parseFrontity(res.body)
    if (!st) {
      lastError = `embed gagal (status ${res.status})`
      continue
    }
    const key = Object.keys(st.source?.data || {}).find(k => k.includes(videoId))
    const node = key ? st.source.data[key] : null
    const v = node?.videoData
    if (!v) return { error: `video tidak tersedia (code ${node?.customErrorCode ?? '?'})` }
    return {
      id: v.itemInfos?.id || videoId,
      description: v.itemInfos?.text || '',
      createTime: v.itemInfos?.createTime || null,
      commentCount: v.itemInfos?.commentCount ?? null,
      diggCount: v.itemInfos?.diggCount ?? null,
      playCount: v.itemInfos?.playCount ?? null,
      shareCount: v.itemInfos?.shareCount ?? null,
      author: {
        uniqueId: v.authorInfos?.uniqueId || '',
        nickname: v.authorInfos?.nickName || '',
        bio: v.authorInfos?.signature || '',
        secUid: v.authorInfos?.secUid || ''
      },
      avatar: v.authorInfos?.covers?.[0] || '',
      cover: v.itemInfos?.covers?.[0] || '',
      playUrl: v.itemInfos?.video?.urls?.[0] || '',
      width: v.itemInfos?.video?.videoMeta?.width || 0,
      height: v.itemInfos?.video?.videoMeta?.height || 0
    }
  }
  return { error: lastError }
}

function parseUniversal(html) {
  const m = html.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]*?)<\/script>/
  )
  if (!m) return null
  try {
    return JSON.parse(m[1])
  } catch {
    return null
  }
}

async function getProfile(uniqueId) {
  if (!uniqueId) return { links: [] }
  try {
    const { body } = await text(`https://www.tiktok.com/@${uniqueId}`)
    const uni = parseUniversal(body)
    const user = uni?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo?.user || {}
    let bioLink = null
    const bm = body.match(/"bioLink":\{"link":"([^"]+)"/)
    if (bm) bioLink = bm[1].replace(/\\u002F/g, '/')
    const links = extractLinks(body).filter(
      u => !isNoiseUrl(u) && !/youtube|instagram|twitter|x\.com/i.test(u)
    )
    return {
      bio: user.signature || '',
      nickname: user.nickname || '',
      bioLink,
      links: [...new Set([...(bioLink ? [bioLink] : []), ...links])]
    }
  } catch (e) {
    return { links: [], error: e.message }
  }
}

async function getComments(videoId, author = '', maxPages = 4) {
  const all = []
  let cursor = 0
  for (let p = 0; p < maxPages; p++) {
    const q = new URLSearchParams({
      device_id: '7000000000000000001',
      aweme_id: videoId,
      count: '50',
      cursor: String(cursor),
      aid: '1233',
      app_language: 'en',
      device_platform: 'android',
      os_version: '29',
      region: 'ID'
    })
    try {
      const res = await http(`https://www.tiktok.com/api/comment/list/?${q}`, {
        accept: 'application/json',
        timeout: 15000
      })
      const body = await res.text()
      if (!body) break
      const j = JSON.parse(body)
      const list = j.comments || []
      for (const c of list) {
        const user = c.user?.unique_id || ''
        all.push({
          text: decodeEntities(c.text || ''),
          user,
          pinned: c.author_pin === true,
          diggCount: c.digg_count || 0,
          cid: c.cid || '',
          replyCount: c.reply_comment_total ?? c.reply_count ?? 0,
          byAuthor: !!author && user === author
        })
      }
      if (!j.has_more) break
      if (!list.length) break
      cursor = j.cursor ?? cursor + 50
      await sleep(350)
    } catch {
      break
    }
  }
  all.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.diggCount - a.diggCount)
  return all
}

const REPLY_UA =
  'com.zhiliaoapp.musically/300000 (Linux; U; Android 13; id_ID; M2101K6G; Build/TKQ1.220829.002; Cronet/TTNetVersion:b4d74d55 2023-02-16 QuicVersion:41928d6a 2023-01-30)'

const REPLY_Q = {
  device_id: '7185643774736387594',
  iid: '7129847366169418245',
  version_code: '300000',
  aid: '1180',
  device_platform: 'android',
  channel: 'googleplay',
  app_name: 'musically',
  os_api: '33',
  os_version: '13',
  os_name: 'Android',
  device_type: 'Redmi Note 10',
  resolution: '1080*2400',
  language: 'en'
}

async function getReplies(videoId, cid, maxPages = 2) {
  const out = []
  let cursor = 0
  for (let p = 0; p < maxPages; p++) {
    const q = new URLSearchParams({
      ...REPLY_Q,
      aweme_id: videoId,
      comment_id: String(cid),
      cursor: String(cursor),
      count: '20'
    })
    try {
      const res = await http(`https://api16.tiktokv.com/aweme/v1/comment/list/reply/?${q}`, {
        accept: 'application/json',
        ua: REPLY_UA,
        referer: 'https://www.tiktok.com/',
        timeout: 15000
      })
      const body = await res.text()
      if (!body) break
      const j = JSON.parse(body)
      if (j.status_code && j.status_code !== 0) break
      const list = j.comments || []
      for (const c of list) {
        out.push({
          text: decodeEntities(c.text || ''),
          user: c.user?.unique_id || '',
          pinned: false,
          diggCount: c.digg_count || 0,
          reply: true
        })
      }
      if (!j.has_more || !list.length) break
      cursor = j.cursor ?? cursor + 20
      await sleep(250)
    } catch {
      break
    }
  }
  return out
}

function getReplyParents(comments, maxParents = 25) {
  return comments
    .filter(c => c.cid && c.replyCount > 0)
    .sort(
      (a, b) =>
        Number(b.byAuthor) - Number(a.byAuthor) ||
        Number(b.pinned) - Number(a.pinned) ||
        b.diggCount - a.diggCount
    )
    .slice(0, maxParents)
}

const THUMB_QUALITY = { large: 0, med: 1, medium: 1, small: 2, tiny: 3 }
const THUMB_RE =
  /(?:https?:)?\/\/firebasestorage\.googleapis\.com(?::\d+)?\/[^\s"'<>]*thumb(?:-\w+)?\.jpg(?:\?[^\s"'<>]*)?/i
const THUMB_ALL = new RegExp(THUMB_RE.source, 'gi')
const normThumb = u => {
  if (!u) return u
  return (u.startsWith('//') ? 'https:' + u : u).replace(/\\+$/, '')
}

function thumbQuality(u) {
  const key = String(u).match(/thumb(?:-(\w+))?\.jpg/i)?.[1]?.toLowerCase() || ''
  return key in THUMB_QUALITY ? THUMB_QUALITY[key] : 9
}

async function getShareInfo(url) {
  try {
    const { status, body } = await text(url, { timeout: 15000 })
    const m = body.match(/<title>([\s\S]*?)<\/title>/i)
    const rawTitle = m ? m[1] : ''
    const title = rawTitle
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/ - Alight Motion Project$/i, '')
    const flat = body.replace(/\\\//g, '/').replace(/&amp;/g, '&')
    const visible = flat.replace(/<!--[\s\S]*?-->/g, ' ')
    const shown = normThumb(
      visible.match(/<img[^>]*class=["'][^"']*\bthumb\b[^"']*["'][^>]*src=["']([^"']+)["']/i)?.[1]
    )
    const og = normThumb(
      visible.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1]
    )
    const found = [...new Set([...flat.matchAll(THUMB_ALL)].map(x => normThumb(x[0])))].sort(
      (a, b) => thumbQuality(a) - thumbQuality(b)
    )
    const thumbs = [...new Set([shown, og, ...found].filter(u => u && THUMB_RE.test(u)))]
    const isAmPage =
      /property=["']og:site_name["'][^>]*content=["']Alight Motion["']/i.test(visible) ||
      /alight motion (package|project)/i.test(visible) ||
      /\balight motion\b/i.test(rawTitle)
    const rateLimited = status === 401 || status === 403 || status === 429
    const valid =
      status >= 500
        ? null
        : isAmPage && ((status >= 200 && status < 400) || rateLimited)
          ? true
          : false
    return { title: title || null, thumb: thumbs[0] || null, thumbs, valid }
  } catch {
    return { title: null, thumb: null, thumbs: [], valid: null }
  }
}

async function getShareTitle(url) {
  return (await getShareInfo(url)).title
}

function gcdRatio(w, h) {
  if (!w || !h || w <= 0 || h <= 0) return null
  const gcd = (a, b) => (b ? gcd(b, a % b) : a)
  const d = gcd(w, h)
  return `${w / d}:${h / d}`
}

function humanSize(bytes) {
  if (!bytes && bytes !== 0) return null
  const unit = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < unit.length - 1) {
    n /= 1024
    i++
  }
  return i === 0 ? `${Math.round(n)} B` : `${n.toFixed(1)} ${unit[i]}`
}

async function getFileTitle(url) {
  try {
    const { body } = await text(url, { timeout: 12000 })
    const m = body.match(/<title>([\s\S]*?)<\/title>/i)
    if (!m) return null
    const t = m[1].replace(/\s+/g, ' ').trim().replace(/\s+-\s+(Google Drive|MediaFire|Dropbox|Mega)\s*$/i, '')
    return t || null
  } catch {
    return null
  }
}

async function getDriveFileInfo(url) {
  const id = String(url).match(/\/file\/d\/([\w-]{10,})/)?.[1]
  if (!id) return null
  try {
    const res = await http(
      `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`,
      { accept: '*/*', timeout: 25000, referer: 'https://drive.google.com/' }
    )
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('text/html')) return null
    const declared = Number(res.headers.get('content-length') || 0)
    if (declared > 8 * 1024 * 1024) return { sizeBytes: declared, sceneTitle: null, isAm: null }
    const buf = Buffer.from(await res.arrayBuffer())
    const head = buf.subarray(0, 8192).toString('utf8')
    const scene = head.match(/<scene[^>]*\stitle="([^"]*)"/)
    const sceneTag = head.match(/<scene\s[^>]*>/)
    const w = Number(sceneTag?.[0].match(/\swidth="(\d+)"/)?.[1] || 0)
    const h = Number(sceneTag?.[0].match(/\sheight="(\d+)"/)?.[1] || 0)
    const amMark = /<alight[\s>/]/i.test(head) || /<scene[\s>]/i.test(head)
    const isText =
      /xml|text|json|javascript/i.test(ct) ||
      (!buf.subarray(0, 512).includes(0) && /^\s*</.test(head))
    const isAm = amMark ? true : isText && !/\.ampreset(\?|$)/i.test(url) ? false : null
    return {
      sizeBytes: declared || buf.length,
      sceneTitle: scene ? scene[1] : null,
      ratio: gcdRatio(w, h),
      isAm
    }
  } catch {
    return null
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx], idx)
    }
  })
  await Promise.all(workers)
  return out
}

function sourceLabel(kind, extra) {
  if (kind === 'description') return 'description'
  if (kind === 'bio') return 'bio'
  if (kind === 'bioLink') return 'bioLink'
  if (kind === 'comment') return `comment${extra?.pinned ? ':pinned' : ''}`
  return kind
}

function collectUrls(node, out = new Set(), depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return out
  if (Array.isArray(node)) {
    for (const n of node) collectUrls(n, out, depth + 1)
    return out
  }
  for (const k of ['url', 'href']) {
    const v = node[k]
    if (typeof v === 'string' && /^https?:\/\//i.test(v)) out.add(v)
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'url' || k === 'href') continue
    if (v && typeof v === 'object') collectUrls(v, out, depth + 1)
  }
  return out
}

async function harvestLinktree(url) {
  try {
    const { body } = await text(url, { timeout: 15000 })
    const nd = body.match(
      /<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/
    )
    if (nd) {
      try {
        const pp = JSON.parse(nd[1])?.props?.pageProps
        const roots = [pp?.links, pp?.socialLinks, pp?.pinnedLinks, pp?.account?.links].filter(
          Boolean
        )
        const set = new Set()
        roots.forEach(r => collectUrls(r, set))
        const clean = [...set].filter(u => !isNoiseUrl(u) && u !== url)
        if (clean.length) return clean
      } catch {}
    }
    const sh = hostOf(url) || ''
    return extractLinks(body).filter(u => {
      if (u === url) return false
      if (isNoiseUrl(u)) return false
      const h = hostOf(u)
      if (!h) return false
      if (h.endsWith('.internal')) return false
      if (h === sh || h.endsWith('.' + sh)) return false
      return true
    })
  } catch {
    return []
  }
}

const SHARE_HOSTS = ['whatsapp.com', 'wa.me', 't.me', 'telegram.me']

function ogTitle(html) {
  const tag = String(html || '').match(/<meta[^>]*og:title[^>]*>/i)
  const c = tag && tag[0].match(/content=["']([^"']*)["']/i)
  const t = String(html || '').match(/<title[^>]*>([^<]*)<\/title>/i)
  const raw = (c && c[1]) || (t && t[1]) || ''
  return decodeEntities(String(raw).replace(/\s+/g, ' ').trim())
}

function ogImage(html) {
  const tag = String(html || '').match(/<meta[^>]*og:image[^>]*>/i)
  const c = tag && tag[0].match(/content=["']([^"']+)["']/i)
  return c ? decodeEntities(c[1]) : null
}

function noEmoji(str) {
  return String(str || '')
    .replace(/[\u{1F000}-\u{1FFFF}\u{2190}-\u{2BFF}\u{2600}-\u{27BF}\u{FE0E}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function shareKind(u) {
  const h = hostOf(u) || ''
  if (h === 'wa.me') return 'chat'
  if (h === 'chat.whatsapp.com') return 'group'
  if (h.includes('whatsapp')) return 'channel'
  return 'telegram'
}

function shareLinksOf(others) {
  const seen = new Set()
  const out = []
  for (const o of others) {
    if (!o || !hostIn(o.url, SHARE_HOSTS)) continue
    if (seen.has(o.url)) continue
    seen.add(o.url)
    out.push(o.url)
    if (out.length >= 4) break
  }
  return out
}

async function harvestTelegram(url) {
  const m = String(url).match(
    /^https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{4,})\/?(?:\?.*)?$/i
  )
  if (!m) return null
  try {
    const { status, body } = await text(`https://t.me/s/${m[1]}`, { timeout: 8000 })
    if (status && status >= 400) return null
    const links = [
      ...new Set(
        [
          ...body.matchAll(
            /https:\/\/(?:alight\.link\/[A-Za-z0-9]+|drive\.google\.com\/file\/d\/[A-Za-z0-9_-]+[^"<\s]*|drive\.google\.com\/folderview\?id=[A-Za-z0-9_-]+|docs\.google\.com\/(?:file|document)\/d\/[A-Za-z0-9_-]+[^"<\s]*)/g
          )
        ].map(x => x[0])
      )
    ].slice(0, 8)
    return { title: ogTitle(body), links }
  } catch {
    return null
  }
}

const CACHE_FILE = fileURLToPath(new URL('./amfinder.cache.json', import.meta.url))
const CACHE_VER = 'v8'
const CACHE_MAX = 400
const TTL_FOUND = 86400
const TTL_EMPTY = 3600

function loadCache() {
  try {
    const v = JSON.parse(readFileSync(CACHE_FILE, 'utf8'))
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

function stripNulls(v) {
  if (Array.isArray(v)) return v.map(stripNulls).filter(x => x !== null && x !== undefined)
  if (v && typeof v === 'object') {
    const o = {}
    for (const [k, x] of Object.entries(v)) {
      const y = stripNulls(x)
      if (y !== null && y !== undefined) o[k] = y
    }
    return o
  }
  return v
}

function saveCache(cache) {
  try {
    const now = Date.now()
    const entries = Object.entries(cache)
      .filter(([, e]) => e && e.v && now - e.t < (e.ttl || TTL_EMPTY) * 1000)
      .sort((a, b) => b[1].t - a[1].t)
      .slice(0, CACHE_MAX)
    const tmp = CACHE_FILE + '.tmp'
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(entries)))
    renameSync(tmp, CACHE_FILE)
  } catch {
    /* cache bukan kewajiban, gagal tulis diabaikan */
  }
}

async function main() {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
  const flags = new Set(process.argv.slice(2).filter(a => a.startsWith('--')))
  const input = args[0]

  if (flags.has('--cache-clear')) {
    try {
      rmSync(CACHE_FILE, { force: true })
      log('[cache] dibersihkan')
    } catch {}
    if (!input) {
      process.stdout.write(JSON.stringify({ ok: true, message: 'cache dibersihkan' }, null, 2) + '\n')
      return
    }
  }

  const noCache = flags.has('--no-cache')
  const cache = noCache ? null : loadCache()
  const emit = out =>
    process.stdout.write(JSON.stringify(out, null, flags.has('--raw') ? 0 : 2) + '\n')

  if (!input) {
    emit({
      ok: false,
      error:
        'usage: node amfinder.js <url-tiktok-video>  |  node amfinder.js <url-preset-untuk-resolve>\n' +
        'flags: --raw  --all  --no-cache  --cache-clear'
    })
    process.exit(1)
  }

  if (/^https?:\/\//i.test(input) && !/tiktok\.(com|v)/i.test(input)) {
    const key = 'resolve:' + CACHE_VER + ':' + input
    const hit = cache && cache[key]
    if (hit) {
      log('[cache] resolve hit')
      emit(hit.v)
      return
    }
    log('[resolve] follow redirect...')
    const r = await resolveChain(input)
    const share = r.amUrl ? await getShareInfo(r.amUrl) : { title: null, thumb: null }
    const out = {
      ok: true,
      mode: 'resolve',
      input,
      resolved: r.amUrl || r.finalUrl,
      isAlight: !!r.amUrl,
      title: share.title,
      chain: r.chain
    }
    if (share.thumb) out.thumb = share.thumb
    if (share.thumbs && share.thumbs.length > 1) out.thumbs = share.thumbs
    if (typeof share.valid === 'boolean') out.valid = share.valid
    const rOut = stripNulls(out)
    if (cache) {
      cache[key] = { t: Date.now(), ttl: TTL_FOUND, v: rOut }
      saveCache(cache)
    }
    emit(rOut)
    return
  }

  log('[1/5] resolve url...')
  const { videoId, canonical } = await resolveTiktokUrl(input)
  log('      videoId =', videoId)

  const cacheKey = 'video:' + videoId + (flags.has('--all') ? ':all' : '')
  const cached = cache && cache[cacheKey]
  if (cached) {
    const age = Math.round((Date.now() - cached.t) / 1000)
    log(`[cache] hit ${videoId} (${age}s lalu), lewati scraping`)
    emit(cached.v)
    return
  }

  log('[2/5] ambil data video...')
  let info = await getVideoInfo(videoId)
  if (info.error && /status/.test(info.error)) {
    log('      embed:', info.error, '-> coba lagi')
    await sleep(800)
    info = await getVideoInfo(videoId, 1)
  }
  const uniqueId =
    info.author?.uniqueId || canonical?.match(/tiktok\.com\/@([^/?#]+)/)?.[1] || ''
  if (uniqueId && !info.author?.uniqueId) info.author = { ...(info.author || {}), uniqueId }
  if (uniqueId) log('      author = @' + uniqueId)
  if (info.description) info.description = decodeEntities(info.description)

  let cleanPlay = null

  log('[3/5] ambil profil + bio link...')
  const profile = await getProfile(uniqueId)
  if (profile.bioLink) log('      bioLink =', profile.bioLink)
  const ctx = videoContext(info.description, info.author?.bio, profile.bio)
  log('      konteks video:', ctx.level, ctx.matched.join(' ') || '(tanpa kata kunci preset)')

  log('[4/5] ambil komentar...')
  const topLevel = await getComments(videoId, uniqueId)
  log('      komentar =', topLevel.length)
  let replies = []
  const comments = topLevel

  const collected = []
  const seenUrl = new Set()
  const add = (url, kind, extra) => {
    const u = cleanUrl(url)
    if (!u || seenUrl.has(u)) return
    if (isNoiseUrl(u)) return
    seenUrl.add(u)
    collected.push({
      url: u,
      source: sourceLabel(kind, extra),
      detail: extra?.detail || null,
      kind,
      pinned: !!extra?.pinned,
      byAuthor: !!extra?.byAuthor,
      digg: extra?.digg || 0
    })
  }

  extractLinks(info.description || '').forEach(u => add(u, 'description'))
  extractLinks(profile.bio || '').forEach(u => add(u, 'bio'))
  ;(profile.bioLink ? [profile.bioLink] : []).forEach(u => add(u, 'bioLink'))
  ;(profile.links || []).forEach(u => add(u, 'bioLink'))
  for (const c of comments) {
    const detail = '@' + c.user + (c.reply ? ' (balasan)' : '')
    extractLinks(c.text).forEach(u =>
      add(u, 'comment', { pinned: c.pinned, byAuthor: c.byAuthor, digg: c.diggCount, detail })
    )
  }

  if (!collected.some(x => isAmUrl(x.url))) {
    const parents = getReplyParents(topLevel, 12)
    if (parents.length) log('      cek balasan komentar:', parents.length, 'thread...')
    const startLen = collected.length
    for (let i = 0; i < parents.length; i += 3) {
      const chunk = await mapLimit(parents.slice(i, i + 3), 3, p => getReplies(videoId, p.cid))
      for (const c of chunk.flat()) {
        replies.push(c)
        extractLinks(c.text).forEach(u =>
          add(u, 'comment', {
            pinned: false,
            byAuthor: !!uniqueId && c.user === uniqueId,
            digg: c.diggCount,
            detail: '@' + c.user + ' (balasan)'
          })
        )
      }
      await sleep(200)
      const found = collected.slice(startLen)
      if (found.some(x => isAmUrl(x.url))) break
      if (found.some(x => isFileUrl(x.url)) && i >= 6) break
      if (replies.length > 80) break
    }
    if (replies.length) log('      balasan  =', replies.length)
  }

  log('[5/5] telusuri & resolve link...')
  let openedTrees = 0
  if (!collected.some(x => isAmUrl(x.url))) {
    const trees = collected.filter(x => isLinktree(x.url)).map(x => x.url)
    if (trees.length) {
      log('      buka link-in-bio:', trees.length)
      const res = await mapLimit(trees, 4, harvestLinktree)
      res.flat().slice(0, 40).forEach(u => add(u, 'bioLink'))
      openedTrees = trees.length
    }
  }

  const rank = x =>
    isAmUrl(x.url) ? 0 : isFileUrl(x.url) ? 1 : isSocialUrl(x.url) ? 3 : 2

  const tgUrls = [
    ...new Set(collected.filter(x => hostIn(x.url, ['t.me', 'telegram.me'])).map(x => x.url))
  ].slice(0, 2)
  if (tgUrls.length && !collected.some(x => isAmUrl(x.url) || isFileUrl(x.url))) {
    log('      buka channel telegram:', tgUrls.length)
    const res = await mapLimit(tgUrls, 2, harvestTelegram)
    res.forEach((r, i) => {
      if (!r) return
      const fresh = r.links.filter(l => !collected.some(x => x.url === l))
      if (fresh.length) {
        log('      telegram:', fresh.length, 'link preset dari', tgUrls[i])
        fresh.forEach(l => add(l, 'telegram'))
      }
    })
  }

  const ordered = [...collected].sort((a, b) => rank(a) - rank(b))
  const resolveTargets = ordered
    .filter(x => !isFileUrl(x.url) && !isSocialUrl(x.url))
    .slice(0, 15)
    .map(x => x.url)

  if (resolveTargets.length) {
    log('      resolve', resolveTargets.length, 'link...')
    const resolved = await mapLimit(resolveTargets, 5, async u => ({ u, ...(await resolveChain(u)) }))
    for (const r of resolved) {
      const target = r.amUrl || (isAmUrl(r.finalUrl) ? r.finalUrl : null)
      if (!target) continue
      const hit = collected.find(x => x.url === r.u)
      collected.push({
        url: target,
        source: hit?.source || 'unknown',
        detail: hit?.detail || null,
        kind: hit?.kind || 'redirect',
        origin: r.u !== target ? r.u : null,
        pinned: !!hit?.pinned,
        byAuthor: !!hit?.byAuthor,
        digg: hit?.digg || 0
      })
      seenUrl.add(target)
    }
  }

  const preset = []
  const others = []
  const done = new Set()
  for (const x of ordered.concat(collected)) {
    if (done.has(x.url)) continue
    done.add(x.url)
    if (isAmUrl(x.url)) {
      preset.push({
        type: '5mb',
        url: x.origin || x.url,
        resolved: x.url,
        title: null,
        source: x.source,
        detail: x.detail,
        kind: x.kind,
        pinned: !!x.pinned,
        byAuthor: !!x.byAuthor,
        digg: x.digg || 0
      })
    } else if (isFileUrl(x.url)) {
      preset.push({
        type: 'xml',
        url: x.url,
        resolved: x.url,
        title: null,
        source: x.source,
        detail: x.detail,
        kind: x.kind,
        pinned: !!x.pinned,
        byAuthor: !!x.byAuthor,
        digg: x.digg || 0
      })
    } else {
      others.push({ url: x.url, source: x.source, detail: x.detail })
    }
  }

  let droppedInvalid = 0
  if (preset.length) {
    log('      ambil judul + ukuran preset...')
    if (flags.has('--all')) {
      cleanPlay = getCleanPlayUrl(canonical || `https://www.tiktok.com/@${uniqueId}/video/${videoId}`)
    }
    await mapLimit(preset, 4, async p => {
      if (p.type === '5mb') {
        const share = await getShareInfo(p.resolved)
        p.title = share.title
        p.thumb = share.thumb
        p.thumbs = share.thumbs
        p.verified = share.valid === true
        if (share.valid === false) p.dead = true
        return
      }
      const d = await getDriveFileInfo(p.resolved)
      if (d) {
        p.size = humanSize(d.sizeBytes)
        if (d.sceneTitle) p.title = d.sceneTitle
        if (d.ratio) p.ratio = d.ratio
        p.verified = d.isAm === true
        if (d.isAm === false) p.dead = true
      }
      if (!p.title) p.title = await getFileTitle(p.resolved)
    })
    for (const p of preset) if (p.title) p.title = decodeEntities(p.title)
    const dead = preset.filter(p => p.dead)
    if (dead.length) {
      droppedInvalid = dead.length
      log('      buang link tidak valid:', dead.length, dead.map(p => p.type).join(' '))
      for (let i = preset.length - 1; i >= 0; i--) if (preset[i].dead) preset.splice(i, 1)
    }
  }

  if (preset.length) {
    const isDefaultTitle = t => /^proyek baru\s*\d+$/i.test(String(t || '').trim())
    for (const p of preset) {
      if (!isDefaultTitle(p.title)) continue
      const pair = preset.find(
        q => q !== p && q.detail && q.detail === p.detail && q.title && !isDefaultTitle(q.title)
      )
      if (pair) p.title = pair.title
    }

    const pairCount = {}
    for (const p of preset) if (p.detail) pairCount[p.detail] = (pairCount[p.detail] || 0) + 1
    const trust = p => {
      if (p.kind === 'description') return 100
      if (p.byAuthor) return 90
      if (p.kind === 'bio') return 85
      if (p.kind === 'bioLink') return 80
      if (p.pinned) return 70
      if (p.kind === 'comment') return 20 + Math.min(p.digg, 50) / 5
      return 15
    }
    for (const p of preset)
      p.score =
        trust(p) +
        (pairCount[p.detail] > 1 ? 5 : 0) +
        (p.verified ? 15 : 0) +
        (ctx.level === 'core' ? 20 : ctx.level === 'support' ? 8 : 0)
    preset.sort(
      (a, b) =>
        b.score - a.score ||
        (a.type === b.type ? 0 : a.type === '5mb' ? -1 : 1) ||
        b.digg - a.digg
    )
    log('      ranking:', preset.map(p => `${p.type}=${p.score}`).join(' '))
  }

  const videoUrl = canonical || `https://www.tiktok.com/@${uniqueId}/video/${videoId}`

  const out = {
    ok: true,
    found: preset.length > 0,
    author: uniqueId ? `@${uniqueId}` : null,
    videoUrl,
    presetLinks: preset.map(p => {
      const o = { type: p.type, url: p.resolved }
      if (p.title) o.title = p.title
      if (p.size) o.size = p.size
      if (p.ratio) o.ratio = p.ratio
      if (p.thumb) o.thumb = p.thumb
      if (p.thumbs && p.thumbs.length > 1) o.thumbs = p.thumbs
      if (p.source) o.source = p.source
      if (p.detail) o.detail = p.detail
      if (p.byAuthor) o.byAuthor = true
      if (p.pinned) o.pinned = true
      if (p.verified) o.verified = true
      return o
    })
  }
  if (ctx.level !== 'none') out.context = { level: ctx.level, matched: ctx.matched }

  if (!preset.length) {
    out.message =
      'Link preset (5mb/xml) tidak ditemukan, sudah cek deskripsi, bio, link-in-bio' +
      (topLevel.length ? `, ${topLevel.length} komentar` : '') +
      (replies.length ? `, ${replies.length} balasan` : '') +
      '.'
    out.checked = {
      description: !!info.description,
      bio: !!(info.author?.bio || profile.bio),
      bioLinkPage: !!profile.bioLink,
      linkInBio: openedTrees,
      comments: topLevel.length,
      replies: replies.length,
      context: ctx.level,
      invalidLinks: droppedInvalid
    }
    const shareUrls = shareLinksOf(others)
    if (shareUrls.length) {
      const labeled = await mapLimit(shareUrls, 4, async u => {
        const kind = shareKind(u)
        if (kind === 'chat') return { url: u, kind }
        if (kind === 'telegram') {
          const username = (String(u).match(/\/([A-Za-z0-9_]{4,})\/?(?:[?#].*)?$/i) || [])[1] || ''
          return { url: u, kind, username }
        }
        let title = ''
        let avatar = null
        try {
          const { body } = await text(u, { timeout: 6000 })
          title = noEmoji(ogTitle(body).replace(/\s*[-–|]\s*WhatsApp (channel|group)$/i, ''))
          avatar = ogImage(body)
        } catch {}
        return { url: u, kind, title: title || undefined, avatar: avatar || undefined }
      })
      const order = { chat: 0, telegram: 1, channel: 2, group: 3 }
      labeled.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9))
      out.shareLinks = labeled
      log(
        '      sumber lain:',
        labeled.map(x => `${x.kind}:${x.title || x.username || x.url}`).join(' | ')
      )
    }
    if (others.length) {
      out.otherLinks = others
        .filter(o => o.url !== profile.bioLink)
        .slice(0, 10)
        .map(o => (o.detail ? o : { url: o.url, source: o.source }))
    }
  }

  if (flags.has('--all')) {
    out.input = input
    if (preset.length) {
      out.video = {
        id: videoId,
        url: videoUrl,
        description: info.description || '',
        createTime: info.createTime || null,
        stats: {
          views: info.playCount ?? null,
          likes: info.diggCount ?? null,
          comments: info.commentCount ?? comments.length,
          shares: info.shareCount ?? null
        },
        cover: info.cover || null,
        playUrl: info.playUrl || null,
        playUrlNoWm: cleanPlay ? await cleanPlay : null,
        width: info.width || null,
        height: info.height || null
      }
      out.authorDetail = {
        uniqueId,
        nickname: info.author?.nickname || profile.nickname || '',
        bio: info.author?.bio || profile.bio || '',
        bioLink: profile.bioLink || null,
        avatar: info.avatar || null
      }
    }
    out.otherLinks = others.slice(0, 30)
    out.scanned = {
      description: !!info.description,
      bio: !!(info.author?.bio || profile.bio),
      bioLinkPage: !!profile.bioLink,
      comments: topLevel.length,
      replies: replies.length,
      pinnedComment: comments.find(c => c.pinned)?.text || null
    }
  }

  const final = stripNulls(out)

  if (cache) {
    cache[cacheKey] = { t: Date.now(), ttl: final.found ? TTL_FOUND : TTL_EMPTY, v: final }
    saveCache(cache)
  }
  emit(final)
}

main().catch(err => {
  process.stdout.write(JSON.stringify({ ok: false, error: err.message }, null, 2) + '\n')
  process.exit(1)
})
