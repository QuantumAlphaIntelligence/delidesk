#!/usr/bin/env node
/**
 * Roda electron-builder NSIS com CHANNEL=sandbox|prod.
 * Overlay: appId / productName / shortcut / guid estáveis por canal
 * (pin na barra de tarefas não some ao atualizar o mesmo canal).
 */
import { spawnSync } from 'child_process'
import { writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const channel = (process.argv[2] || '').toLowerCase()
if (channel !== 'sandbox' && channel !== 'prod') {
  console.error('Uso: node scripts/run-builder-win.mjs sandbox|prod')
  process.exit(1)
}

process.env.CHANNEL = channel
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const isProd = channel === 'prod'

const overlay = {
  appId: isProd ? 'br.com.delivai.delidesk' : 'br.com.delivai.delidesk.sandbox',
  productName: isProd ? 'DeliDesk' : 'DeliDesk Test',
  executableName: isProd ? 'DeliDesk' : 'DeliDeskTest',
  nsis: {
    shortcutName: isProd ? 'DeliDesk' : 'DeliDesk Test',
    // GUIDs fixos por canal — upgrade in-place (não remove pin)
    guid: isProd
      ? 'e8b7c2a1-4d5f-4a9b-9c1e-111111111111'
      : 'e8b7c2a1-4d5f-4a9b-9c1e-222222222222',
    deleteAppDataOnUninstall: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true
  }
}

const overlayPath = join(root, 'electron-builder.override.json')
writeFileSync(overlayPath, `${JSON.stringify(overlay, null, 2)}\n`, 'utf8')
console.log(`Wrote ${overlayPath} (channel=${channel})`)

const result = spawnSync(
  'npx',
  [
    'electron-builder',
    '--win',
    'nsis',
    '--x64',
    '--publish',
    'never',
    '-c',
    'electron-builder.yml',
    '-c',
    'electron-builder.override.json'
  ],
  { stdio: 'inherit', env: process.env, cwd: root, shell: true }
)
process.exit(result.status ?? 1)
