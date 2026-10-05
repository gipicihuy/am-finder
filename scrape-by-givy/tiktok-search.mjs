#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..')
const AMFINDER = path.join(REPO_ROOT, 'lib', 'amfinder.js')

const USAGE = `Cari video TikTok lewat kata kunci (search web TikTok, chromium headless via CDP).

Pemakaian:
  node scrape-by-givy/tiktok-search.mjs "preset alight motion velocity"
  node scrape-by-givy/tiktok-search.mjs "preset shake 5mb" --limit 10
  node scrape-by-givy/tiktok-search.mjs "preset gltch" --run --top 3

Flag:
  --limit N     maksimal kandidat video (default 20)
  --timeout MS  batas tunggu hasil cari muncul (default 30000)
  --min N       berhenti tunggu kalau sudah dapat N hasil (default 8)
  --run         lanjut jalanin pipeline amfinder ke --top kandidat pertama
  --top N       berapa video yang diproses saat --run (default 3)
  --no-cache    dipakai saat --run (abaikan cache amfinder)
  --verbose     tampilkan log chromium & pipeline di stderr
  --help        bantuan ini

Keluaran: JSON di stdout (log di stderr).
`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function parseArgs (argv) {
  const a = {
    queryParts: [], limit: 20, timeout: 30000, min: 8,
    run: false, top: 3, noCache: false, verbose: false, help: false
  }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (k === '--limit') a.limit = Number(argv[++i])
    else if (k === '--timeout') a.timeout = Number(argv[++i])
    else if (k === '--min') a.min = Number(argv[++i])
    else if (k === '--run') a.run = true
    else if (k === '--top') a.top = Number(argv[++i])
    else if (k === '--no-cache') a.noCache = true
    else if (k === '--verbose' || k === '-v') a.verbose = true
    else if (k === '--help' || k === '-h') a.help = true
    else if (k.startsWith('--')) fail(`flag tak dikenal: ${k}\n\n${USAGE}`)
    else a.queryParts.push(k)
  }
  a.query = a.queryParts.join(' ').trim()
  if (!Number.isFinite(a.limit) || a.limit < 1) a.limit = 20
  if (!Number.isFinite(a.timeout) || a.timeout < 5000) a.timeout = 30000
  if (!Number.isFinite(a.min) || a.min < 1) a.min = 8
  if (!Number.isFinite(a.top) || a.top < 1) a.top = 3
  return a
}

function fail (msg) {
  process.stderr.write(String(msg).trim() + '\n')
  process.exit(2)
}

function log (...args) {
  process.stderr.write(args.join(' ') + '\n')
}

function findChrome () {
  const cands = []
  if (process.env.CHROME_PATH) cands.push(process.env.CHROME_PATH)
  cands.push(
    '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium'
  )
  try {
    const home = process.env.HOME || process.env.USERPROFILE || '/root'
    const base = path.join(home, '.cache', 'ms-playwright')
    const dirs = readdirSync(base).filter((d) => d.startsWith('chromium')).sort().reverse()
    for (const d of dirs) {
      cands.push(path.join(base, d, 'chrome-linux', 'chrome'))
      cands.push(path.join(base, d, 'chrome-linux', 'headless_shell'))
    }
  } catch {}
  for (const c of cands) {
    try { if (existsSync(c)) return c } catch {}
  }
  return 'chromium'
}

function launchChrome (verbose) {
  const bin = findChrome()
  const dir = mkdtempSync(path.join(tmpdir(), 'givy-chrome-'))
  const args = [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-extensions', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--mute-audio', '--lang=en-US', '--window-size=1440,3000',
    '--remote-debugging-port=0', `--user-data-dir=${dir}`, 'about:blank'
  ]
  const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  proc.stderr.on('data', (d) => { if (verbose) process.stderr.write(d) })
  return { proc, dir, bin }
}

async function readDevtoolsPort (dir) {
  const file = path.join(dir, 'DevToolsActivePort')
  for (let i = 0; i < 80; i++) {
    try {
      const p = Number(readFileSync(file, 'utf8').split('\n')[0])
      if (p > 0) return p
    } catch {}
    await sleep(200)
  }
  throw new Error('chromium tidak membuka DevTools (kemungkinan gagal start)')
}

async function connect (port) {
  let page = null
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      page = list.find((t) => t.type === 'page')
      if (page) break
    } catch {}
    await sleep(250)
  }
  if (!page) throw new Error('halaman DevTools tidak ditemukan')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', () => rej(new Error('gagal konek ke DevTools')), { once: true })
  })
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m); pending.delete(m.id) }
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id
    const timer = setTimeout(() => { pending.delete(i); reject(new Error(`CDP timeout: ${method}`)) }, 15000)
    pending.set(i, { resolve: (m) => { clearTimeout(timer); resolve(m) } })
    ws.send(JSON.stringify({ id: i, method, params }))
  })
  return { send, close: () => { try { ws.close() } catch {} } }
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

function parseItems (html, limit) {
  const chunks = html.split('data-e2e="search_top-item"').slice(1)
  const out = []
  const seen = new Set()
  for (const c of chunks) {
    if (out.length >= limit) break
    const u = c.match(/https:\/\/www\.tiktok\.com\/(@[A-Za-z0-9._]+)\/(video|photo)\/(\d+)/) ||
      c.match(/href="\/(@[A-Za-z0-9._]+)\/(video|photo)\/(\d+)/)
    if (!u) continue
    const url = `https://www.tiktok.com/${u[1]}/${u[2]}/${u[3]}`
    if (seen.has(url)) continue
    seen.add(url)
    const cap = c.match(
      /data-e2e="search-card-video-caption"[^>]*>([\s\S]*?)(?:data-e2e="search-card-user-link"|data-e2e="search-card-user-unique-id")/
    )
    const name = c.match(/data-e2e="search-card-user-unique-id"[^>]*>([^<]*)</)
    const views = c.match(/data-e2e="video-views"[^>]*>([^<]*)</)
    out.push({
      url,
      handle: u[1],
      author: name ? stripTags(name[1]) : '',
      desc: cap ? stripTags(cap[1]) : '',
      views: views ? stripTags(views[1]) : ''
    })
  }
  return out
}

function diagnoseEmpty (html) {
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '-'
  const flags = ['captcha', 'sec_verify', 'login', 'Verify', 'unusual']
    .filter((f) => html.includes(f))
  let snippet = ''
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)
  if (body) snippet = stripTags(body[1]).slice(0, 200)
  const file = path.join(tmpdir(), 'givy-search-last.html')
  try { writeFileSync(file, html) } catch {}
  log(`[search] diagnosa: title="${title}" penanda=${flags.length ? flags.join(',') : '-'} file=${file}`)
  if (snippet) log(`[search] isi halaman: ${snippet}`)
}

async function attemptSearch (url, opts, attempt) {
  const chrome = launchChrome(opts.verbose)
  let cdp = null
  const t0 = Date.now()
  try {
    const port = await readDevtoolsPort(chrome.dir)
    cdp = await connect(port)
    await cdp.send('Network.enable')
    await cdp.send('Network.setBlockedURLs', {
      urls: ['*.mp4*', '*.m4s*', '*.webm*', '*mime=video*', '/play/*']
    })
    await cdp.send('Page.enable')
    log(`[search] buka ${url} (percobaan ${attempt})`)
    await cdp.send('Page.navigate', { url })

    const deadline = Date.now() + opts.timeout
    let html = ''
    let items = []
    let stable = 0
    let lastCount = -1
    let lastSample = -1
    let errSince = 0
    let reloaded = false
    while (Date.now() < deadline) {
      await sleep(400)
      const r = await cdp.send('Runtime.evaluate', {
        expression: 'document.documentElement.outerHTML',
        returnByValue: true
      })
      html = r?.result?.result?.value || ''
      items = parseItems(html, opts.limit)
      const badNow = !items.length &&
        (html.includes('Something went wrong') || html.includes('Drag the slider to fit the puzzle'))
      const bucket = Math.floor((Date.now() - t0) / 2000)
      if (bucket !== lastSample) {
        lastSample = bucket
        log(`[search] t+${((Date.now() - t0) / 1000).toFixed(1)}s items=${items.length} error=${badNow ? 'YA' : 'tidak'}`)
      }
      if (items.length !== lastCount) {
        lastCount = items.length
        stable = 0
        log(`[search] t+${((Date.now() - t0) / 1000).toFixed(1)}s -> ${items.length} video`)
      } else if (items.length) {
        stable += 400
      }
      if (items.length >= Math.min(opts.limit, opts.min)) break
      if (items.length >= 1 && stable >= 2500) break
      const badPage = badNow
      if (badPage) {
        if (!errSince) {
          errSince = Date.now()
          log('[search] halaman error, tunggu sebentar (bisa transien)...')
        } else if (!reloaded && Date.now() - errSince > 6000) {
          reloaded = true
          errSince = Date.now()
          log('[search] error bertahan, coba muat ulang halaman...')
          await cdp.send('Page.navigate', { url })
        } else if (Date.now() - errSince > 20000) {
          log('[search] error bertahan lama, hentikan percobaan ini')
          break
        }
      } else {
        errSince = 0
      }
    }
    if (items.length) {
      await sleep(2200)
      const r2 = await cdp.send('Runtime.evaluate', {
        expression: 'document.documentElement.outerHTML',
        returnByValue: true
      })
      const html2 = r2?.result?.result?.value || ''
      const items2 = parseItems(html2, opts.limit)
      if (items2.length) { html = html2; items = items2 }
    }
    if (!items.length && html) diagnoseEmpty(html)
    if (items.length && process.env.GIVY_DUMP_HTML) {
      const file = path.join(tmpdir(), 'givy-search-last.html')
      try { writeFileSync(file, html) } catch {}
      log(`[search] HTML disimpan di ${file}`)
    }
    log(`[search] selesai ${((Date.now() - t0) / 1000).toFixed(1)}s, ${items.length} video`)
    return items
  } finally {
    if (cdp) cdp.close()
    chrome.proc.kill('SIGKILL')
    await sleep(300)
    try { rmSync(chrome.dir, { recursive: true, force: true }) } catch {}
  }
}

async function searchTiktok (query, opts) {
  const url = `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`
  let items = []
  for (let attempt = 1; attempt <= 2 && !items.length; attempt++) {
    items = await attemptSearch(url, opts, attempt)
    if (!items.length && attempt < 2) {
      log('[search] 0 hasil, istirahat sebentar lalu coba lagi...')
      await sleep(2500)
    }
  }
  return { pageUrl: url, items }
}

function runPipeline (item, opts) {
  return new Promise((resolve) => {
    const args = [AMFINDER, item.url, '--raw', '--all']
    if (opts.noCache) args.push('--no-cache')
    const p = spawn(process.execPath, args, { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      p.kill('SIGKILL')
      resolve({ ...item, error: 'timeout pipeline' })
    }, 60000)
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => {
      err += d
      if (opts.verbose) process.stderr.write(d)
    })
    p.on('close', () => {
      clearTimeout(timer)
      const jsonStart = out.indexOf('{')
      if (jsonStart < 0) {
        return resolve({ ...item, error: (err.trim().split('\n').pop() || 'output kosong').slice(0, 200) })
      }
      try {
        const r = JSON.parse(out.slice(jsonStart))
        resolve({
          ...item,
          found: !!r.found,
          context: r.context || null,
          presetLinks: r.presetLinks || [],
          message: r.message || null,
          checked: r.checked || null,
          shareLinks: r.shareLinks || null
        })
      } catch {
        resolve({ ...item, error: 'JSON pipeline tidak valid' })
      }
    })
  })
}

async function pool (list, concurrency, worker) {
  const res = new Array(list.length)
  let next = 0
  const runners = Array.from({ length: Math.max(1, Math.min(concurrency, list.length)) }, async () => {
    while (next < list.length) {
      const i = next++
      res[i] = await worker(list[i], i)
    }
  })
  await Promise.all(runners)
  return res
}

async function main () {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) return process.stdout.write(USAGE)
  if (!opts.query) return fail(`query kosong\n\n${USAGE}`)

  const t0 = Date.now()
  const { pageUrl, items } = await searchTiktok(opts.query, opts)

  const result = {
    query: opts.query,
    engine: 'tiktok-web-search (chromium headless + CDP)',
    pageUrl,
    candidates: items.length,
    results: items
  }

  if (opts.run && items.length) {
    const top = items.slice(0, opts.top)
    log(`[pipeline] proses ${top.length} video teratas (konkurensi 2)...`)
    const checked = await pool(top, 2, async (it) => {
      log(`[pipeline] ${it.url}`)
      const r = await runPipeline(it, opts)
      log(`[pipeline] ${r.found ? 'DITEMUKAN' : r.error || 'nihil'}: ${it.url}`)
      return r
    })
    result.checked = checked
    result.foundCount = checked.filter((c) => c.found).length
  }

  result.elapsedMs = Date.now() - t0
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  log(`[done] ${result.elapsedMs}ms`)
}

main().catch((e) => fail(e.stack || e.message))
