import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { createWriteStream } from 'node:fs'
import { createServer } from 'node:net'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const host = '127.0.0.1'
const port = 4173
const url = `http://${host}:${port}/`
const evidenceDir = join(root, '.artifacts', 'verify', 'app-shell')
const viteCli = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const screenshotPath = join(evidenceDir, `${runId}.png`)
const reportPath = join(evidenceDir, `${runId}.json`)
const serverLogPath = join(evidenceDir, `${runId}.server.log`)

function listeningPids() {
  if (process.platform === 'win32') {
    const output = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' })
    return output.split(/\r?\n/).flatMap((line) => {
      const fields = line.trim().split(/\s+/)
      if (
        fields[0] === 'TCP' &&
        fields[1]?.endsWith(`:${port}`) &&
        fields[3]?.toUpperCase() === 'LISTENING'
      ) {
        return [Number(fields[4])]
      }
      return []
    })
  }

  const output = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], {
    encoding: 'utf8',
  })
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => Number(line.trim().split(/\s+/)[1]))
    .filter(Number.isInteger)
}

async function assertPortFree() {
  await new Promise((resolveProbe, rejectProbe) => {
    const probe = createServer()
    probe.once('error', rejectProbe)
    probe.listen(port, host, () => probe.close(resolveProbe))
  }).catch(() => {
    throw new Error(`Port ${port} is already in use. Stop its owner before verifying.`)
  })
}

async function waitUntilReady(server) {
  const deadline = Date.now() + 20_000
  let lastError
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error('Vite exited before the app became ready.')
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
      const html = await response.text()
      if (response.ok && html.includes(`<title>${packageJson.name}</title>`)) return response.status
      lastError = new Error(`Vite returned status ${response.status} without the app title.`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  throw new Error(`Vite did not serve ${url} within 20 seconds: ${lastError?.message ?? 'no response'}`)
}

let server
let browser
let log
let interrupted = false
process.once('SIGINT', () => {
  interrupted = true
  server?.kill()
})

try {
  await mkdir(evidenceDir, { recursive: true })
  await assertPortFree()

  log = createWriteStream(serverLogPath, { flags: 'wx' })
  server = spawn(
    process.execPath,
    [viteCli, '--host', host, '--port', String(port), '--strictPort'],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  )
  server.stdout.pipe(log, { end: false })
  server.stderr.pipe(log, { end: false })
  await once(server, 'spawn')

  await waitUntilReady(server)
  console.log(`[verify] ready at ${url} (Vite PID ${server.pid})`)

  const owners = listeningPids()
  if (server.exitCode !== null || owners.length !== 1 || owners[0] !== server.pid) {
    throw new Error(`Doctor failed. Expected ${url} to be owned by Vite PID ${server.pid}; found ${owners.join(', ') || 'no listener'}.`)
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(3_000) })
  const html = await response.text()
  if (
    response.status !== 200 ||
    !html.includes(`<title>${packageJson.name}</title>`) ||
    !html.includes('/src/main.tsx')
  ) {
    throw new Error(`Doctor failed. ${url} did not serve the pstack app entry point.`)
  }
  console.log(`[verify] doctor passed for ${packageJson.name}@${packageJson.version}; authentication is not used.`)

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const consoleErrors = []
  const pageErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))

  const navigation = await page.goto(url, { waitUntil: 'networkidle', timeout: 15_000 })
  const title = await page.title()
  const appRoot = page.locator('#root')
  const rootCount = await appRoot.count()
  const rootState = rootCount === 1
    ? await appRoot.evaluate((element) => ({
        childCount: element.childElementCount,
        text: element.textContent.trim(),
      }))
    : null
  const bodyText = await page.locator('body').innerText()
  const result = {
    runId,
    action: `Opened ${url} in Chromium`,
    responseStatus: navigation?.status() ?? null,
    title,
    appRootFound: rootCount === 1,
    appRootChildCount: rootState?.childCount ?? null,
    appRootText: rootState?.text ?? null,
    bodyText,
    consoleErrors,
    pageErrors,
    screenshot: screenshotPath,
  }

  await page.screenshot({ path: screenshotPath, fullPage: true })
  await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`)

  if (
    result.responseStatus !== 200 ||
    title !== packageJson.name ||
    !result.appRootFound ||
    result.appRootChildCount !== 0 ||
    result.appRootText !== '' ||
    bodyText.trim() !== '' ||
    consoleErrors.length > 0 ||
    pageErrors.length > 0
  ) {
    throw new Error(`App shell verification failed. Review ${reportPath} and ${screenshotPath}.`)
  }

  console.log(`[verify] app shell passed; screenshot: ${screenshotPath}`)
  console.log(`[verify] evidence report: ${reportPath}`)
} catch (error) {
  console.error(`[verify] ${error.message}`)
  if (server?.exitCode === null) console.error(`[verify] Vite log: ${serverLogPath}`)
  process.exitCode = 1
} finally {
  await browser?.close()
  if (server && server.exitCode === null) {
    const exited = once(server, 'exit').catch(() => {})
    server.kill()
    await Promise.race([exited, new Promise((resolveWait) => setTimeout(resolveWait, 3_000))])
  }
  log?.end()
  if (server) console.log(`[verify] cleanup stopped Vite PID ${server.pid}`)
  if (interrupted) process.exitCode = 130
}
