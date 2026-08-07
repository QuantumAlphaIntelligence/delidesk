import { app, BrowserWindow, nativeImage, shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

/** Sandbox: título distinto; prod: só DeliDesk. */
function resolveWindowTitle(): string {
  const raw = (process.env.DELIDESK_CHANNEL || process.env.CHANNEL || 'sandbox')
    .trim()
    .toLowerCase()
  return raw === 'prod' ? 'DeliDesk' : 'DeliDesk Test'
}

function resolveAppIcon(): Electron.NativeImage | undefined {
  const candidates = [
    join(process.resourcesPath, 'icon.png'),
    join(app.getAppPath(), 'resources', 'icon.png'),
    join(__dirname, '../../resources/icon.png')
  ]
  for (const p of candidates) {
    if (!existsSync(p)) continue
    const img = nativeImage.createFromPath(p)
    if (!img.isEmpty()) return img
  }
  return undefined
}

let mainWindow: BrowserWindow | null = null
let quitting = false

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function markAppQuitting(): void {
  quitting = true
}

export function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    return mainWindow
  }

  const icon = resolveAppIcon()
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 880,
    minHeight: 560,
    // WSL/WSLg: ready-to-show às vezes não dispara (GPU) — mostra já
    show: true,
    backgroundColor: '#0D3C4F',
    autoHideMenuBar: true,
    title: resolveWindowTitle(),
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[window] did-fail-load', { code, desc, url })
  })

  mainWindow.webContents.on('did-finish-load', () => {
    // WSL/WSLg: garante mapa mesmo se ready-to-show falhar
    mainWindow?.show()
    mainWindow?.focus()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.on('close', (e) => {
    // No Linux/WSL o tray costuma falhar — fechar de verdade em vez de hide fantasma
    if (!quitting && process.platform === 'win32') {
      e.preventDefault()
      mainWindow?.hide()
    } else if (!quitting && process.platform !== 'win32') {
      // permite fechar; mark quitting para não reabrir ciclo estranho
      quitting = true
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // reforço imediato (WSL)
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
      console.info('[window] force-show', {
        visible: mainWindow.isVisible(),
        minimized: mainWindow.isMinimized()
      })
    }
  }, 800)

  return mainWindow
}

app.on('before-quit', () => {
  quitting = true
})
