import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, app, nativeTheme, powerMonitor, protocol, session, shell, systemPreferences } from 'electron'
import { type Lang, language } from '@shared/i18n'
import type { IpcEvents, UiCommand } from '@shared/ipc'
import { Core } from './app'
import { registerIpc } from './ipc'
import { type MenuActions, installMenu } from './menu'

const mac = process.platform === 'darwin'
const devUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL']
const AVATAR_SCHEME = 'hangram-avatar'
const IDLE_CHECK_MS = 30_000

protocol.registerSchemesAsPrivileged([{ scheme: AVATAR_SCHEME, privileges: { standard: true, secure: true } }])

let window: BrowserWindow | null = null
let quitting = false
let idleTimer: NodeJS.Timeout | null = null
/** The menu is native and has to be rebuilt whenever the language changes. */
let menuActions: MenuActions | null = null
let menuLang: Lang | null = null

function send<E extends keyof IpcEvents>(event: E, payload: IpcEvents[E]): void {
  if (window && !window.isDestroyed()) window.webContents.send(`event:${event}`, payload)
}

function accentColor(): string | null {
  if (process.platform === 'linux') return null
  try {
    // RRGGBBAA → #rrggbb
    return `#${systemPreferences.getAccentColor().slice(0, 6)}`
  } catch {
    return null
  }
}

const core = new Core({
  dataDir: process.env['HANGRAM_DATA_DIR'] ?? join(app.getPath('userData'), 'data'),
  resourcesDir: app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources'),
  version: app.getVersion(),
  locale: () => app.getLocale(),
  accent: accentColor,
  onState: (state) => {
    if (menuActions && state.lang !== menuLang) {
      menuLang = state.lang
      installMenu(menuActions)
    }
    send('state', state)
    syncIdleTimer()
  },
  onLogin: (event) => send('login', event)
})

/** The idle poll exists only while there is something to lock. */
function syncIdleTimer(): void {
  const minutes = core.settings.current.autoLockMinutes
  const wanted = core.needsSealBeforeQuit && minutes > 0
  if (wanted && !idleTimer) {
    idleTimer = setInterval(() => {
      if (powerMonitor.getSystemIdleTime() >= core.settings.current.autoLockMinutes * 60) void core.lock()
    }, IDLE_CHECK_MS)
  } else if (!wanted && idleTimer) {
    clearInterval(idleTimer)
    idleTimer = null
  }
}

function showWindow(): void {
  if (!window || window.isDestroyed()) return createWindow()
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

function command(payload: UiCommand): void {
  showWindow()
  send('command', payload)
}

function createWindow(): void {
  window = new BrowserWindow({
    width: 940,
    height: 640,
    minWidth: 700,
    minHeight: 440,
    show: false,
    title: 'Hangram',
    ...(mac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 19, y: 19 },
          vibrancy: 'sidebar' as const,
          visualEffectState: 'followWindow' as const,
          backgroundColor: '#00000000'
        }
      : process.platform === 'win32'
        ? { backgroundMaterial: 'mica' as const, autoHideMenuBar: true }
        : { autoHideMenuBar: true, backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#f6f6f6' }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged
    }
  })

  const contents = window.webContents
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(my\.|desktop\.)?telegram\.org\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    if (!devUrl || !url.startsWith(devUrl)) event.preventDefault()
  })
  window.once('ready-to-show', () => window?.show())
  window.on('closed', () => (window = null))

  if (devUrl) void window.loadURL(devUrl)
  else void window.loadFile(join(__dirname, '../renderer/index.html'))

  if (!app.isPackaged && process.env['HANGRAM_CAPTURE']) void devCapture(window)
}

/** Development aid: render a screenshot of the window to a file (optionally after running a script). */
async function devCapture(target: BrowserWindow): Promise<void> {
  const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
  await new Promise<void>((resolve) => target.webContents.once('did-finish-load', () => resolve()))
  await wait(Number(process.env['HANGRAM_CAPTURE_DELAY'] ?? 1200))
  const script = process.env['HANGRAM_EVAL']
  if (script) {
    await target.webContents.executeJavaScript(await fs.readFile(script, 'utf8'), true).catch(console.error)
    await wait(700)
  }
  const image = await target.webContents.capturePage()
  await fs.writeFile(process.env['HANGRAM_CAPTURE']!, image.toPNG())
  if (process.env['HANGRAM_CAPTURE_EXIT']) app.quit()
}

function hardenSession(): void {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  if (devUrl) return
  const policy = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: ${AVATAR_SCHEME}:`,
    "font-src 'self'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ')
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [policy] } })
  })
}

function registerAvatarProtocol(): void {
  // hangram-avatar://a/<account id>?v=<version>
  protocol.handle(AVATAR_SCHEME, (request) => {
    const id = new URL(request.url).pathname.slice(1)
    const image = core.store.avatar(id)
    if (!image) return new Response(null, { status: 404 })
    return new Response(new Uint8Array(image), {
      headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable' }
    })
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)

  void app.whenReady().then(async () => {
    hardenSession()
    registerAvatarProtocol()
    const { importTdata } = registerIpc(core, () => window, command)
    await core.start()
    menuActions = {
      command,
      lock: () => void core.lock(),
      importTdata: () => {
        showWindow()
        void importTdata().catch(() => undefined)
      }
    }
    menuLang = language()
    installMenu(menuActions)
    createWindow()

    const lockIfWanted = (): void => {
      if (core.settings.current.lockOnSleep) void core.lock()
    }
    powerMonitor.on('suspend', lockIfWanted)
    powerMonitor.on('lock-screen', lockIfWanted)

    nativeTheme.on('updated', core.notify)
    if (mac) systemPreferences.subscribeNotification('AppleColorPreferencesChangedNotification', core.notify)
    else if (process.platform === 'win32') systemPreferences.on('accent-color-changed', core.notify)

    app.on('activate', showWindow)
  })

  app.on('window-all-closed', () => {
    if (!mac) app.quit()
  })

  // With protection on, nothing may stay decrypted once we are gone.
  app.on('before-quit', (event) => {
    if (quitting) return
    quitting = true
    event.preventDefault()
    const work = core.needsSealBeforeQuit ? core.lock() : core.login.cancelAll()
    void work.catch(console.error).finally(() => app.quit())
  })
}
