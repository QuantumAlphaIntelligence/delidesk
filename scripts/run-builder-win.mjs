#!/usr/bin/env node
/**
 * Roda electron-builder NSIS com CHANNEL=sandbox|prod.
 * Overlay só com campos do canal — base fica em electron-builder.yml
 * (não reparsear YAML: o parser mínimo quebrava extraResources/win.target).
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
    guid: isProd
      ? 'e8b7c2a1-4d5f-4a9b-9c1e-111111111111'
      : 'e8b7c2a1-4d5f-4a9b-9c1e-222222222222',
  },
}

const configPath = join(root, 'electron-builder.override.json')
writeFileSync(configPath, `${JSON.stringify(overlay, null, 2)}\n`, 'utf8')
console.log(`Wrote ${configPath} (channel=${channel}; base=electron-builder.yml)`)

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
    'electron-builder.override.json',
  ],
  { stdio: 'inherit', env: process.env, cwd: root, shell: true }
)
process.exit(result.status ?? 1)
