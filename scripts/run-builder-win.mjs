#!/usr/bin/env node
/**
 * Roda electron-builder NSIS com CHANNEL=sandbox|prod.
 * electron-builder 26 só aplica o último `-c` — por isso o overlay precisa
 * trazer directories/win/nsis/extraResources (não só appId).
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

const config = {
  appId: isProd ? 'br.com.delivai.delidesk' : 'br.com.delivai.delidesk.sandbox',
  productName: isProd ? 'DeliDesk' : 'DeliDesk Test',
  executableName: isProd ? 'DeliDesk' : 'DeliDeskTest',
  copyright: 'Copyright © DelivAI',
  directories: {
    output: 'release',
    buildResources: 'resources',
  },
  files: ['out/**/*'],
  asar: true,
  extraMetadata: {
    main: 'out/main/index.js',
  },
  extraResources: [
    { from: 'resources/channel.json', to: 'channel.json' },
    { from: 'resources/icon.png', to: 'icon.png' },
    { from: 'resources/install-virtual-printer.ps1', to: 'install-virtual-printer.ps1' },
    { from: 'resources/uninstall-virtual-printer.ps1', to: 'uninstall-virtual-printer.ps1' },
  ],
  publish: {
    provider: 'generic',
    url: `https://updates.delivai.local/delidesk/${channel}/`,
  },
  win: {
    icon: 'icon.png',
    target: [{ target: 'nsis', arch: ['x64'] }],
    artifactName: `DeliDesk-\${version}.\${ext}`,
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: isProd ? 'DeliDesk' : 'DeliDesk Test',
    include: 'build/installer.nsh',
    deleteAppDataOnUninstall: false,
    allowElevation: true,
    guid: isProd
      ? 'e8b7c2a1-4d5f-4a9b-9c1e-111111111111'
      : 'e8b7c2a1-4d5f-4a9b-9c1e-222222222222',
  },
}

const configPath = join(root, 'electron-builder.override.json')
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
console.log(`Wrote ${configPath} (channel=${channel}, output=release)`)

const result = spawnSync(
  'npx',
  ['electron-builder', '--win', 'nsis', '--x64', '--publish', 'never', '-c', 'electron-builder.override.json'],
  { stdio: 'inherit', env: process.env, cwd: root, shell: true }
)
process.exit(result.status ?? 1)
