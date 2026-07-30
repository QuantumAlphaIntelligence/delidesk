import { app, Menu, Tray, nativeImage } from 'electron'
import { getMainWindow, markAppQuitting } from './window'
import { printTestCoupon } from './print-service'

let tray: Tray | null = null

function trayIcon(): Electron.NativeImage {
  const size = 16
  const canvas = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const edge = x === 0 || y === 0 || x === size - 1 || y === size - 1
      if (edge) {
        canvas[i] = 13
        canvas[i + 1] = 60
        canvas[i + 2] = 79
        canvas[i + 3] = 255
      } else {
        canvas[i] = 71
        canvas[i + 1] = 242
        canvas[i + 2] = 199
        canvas[i + 3] = 255
      }
    }
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size })
}

function rebuildMenu(): void {
  if (!tray) return
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir painel',
      click: () => {
        const win = getMainWindow()
        win?.show()
        win?.focus()
      }
    },
    {
      label: 'Testar cupom',
      click: () => {
        void printTestCoupon()
      }
    },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        markAppQuitting()
        app.quit()
      }
    }
  ])
  tray.setContextMenu(contextMenu)
}

export function createTray(): Tray {
  if (tray) return tray

  tray = new Tray(trayIcon())
  tray.setToolTip('DeliDesk')
  rebuildMenu()

  tray.on('double-click', () => {
    const win = getMainWindow()
    win?.show()
    win?.focus()
  })

  return tray
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
