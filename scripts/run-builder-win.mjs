#!/usr/bin/env node
/**
 * Roda electron-builder NSIS com CHANNEL=sandbox|prod.
 * Overlay: appId / productName / shortcut / guid estáveis por canal
 * (pin na barra de tarefas não some ao atualizar o mesmo canal).
 */
import { spawnSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
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

/** Parse YAML mínimo o suficiente para electron-builder.yml deste repo (sem deps). */
function loadBaseConfig() {
  const raw = readFileSync(join(root, 'electron-builder.yml'), 'utf8')
  /** @type {Record<string, unknown>} */
  const out = {}
  /** @type {Record<string, unknown>[]} */
  const stack = [out]
  /** @type {number[]} */
  const indents = [-1]
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const m = line.match(/^(\s*)([^:#]+):\s*(.*)$/)
    if (!m) continue
    const indent = m[1].length
    const key = m[2].trim()
    let value = m[3].trim()
    while (indents.length && indent <= indents[indents.length - 1]) {
      stack.pop()
      indents.pop()
    }
    const parent = stack[stack.length - 1]
    if (value === '') {
      const child = {}
      parent[key] = child
      stack.push(child)
      indents.push(indent)
    } else {
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      parent[key] = value
    }
  }
  return out
}

const base = loadBaseConfig()
const nsisBase =
  base.nsis && typeof base.nsis === 'object'
    ? { .../** @type {Record<string, unknown>} */ (base.nsis) }
    : {}

const config = {
  ...base,
  appId: isProd ? 'br.com.delivai.delidesk' : 'br.com.delivai.delidesk.sandbox',
  productName: isProd ? 'DeliDesk' : 'DeliDesk Test',
  executableName: isProd ? 'DeliDesk' : 'DeliDeskTest',
  directories: { output: 'release', buildResources: 'resources' },
  nsis: {
    ...nsisBase,
    shortcutName: isProd ? 'DeliDesk' : 'DeliDesk Test',
    guid: isProd
      ? 'e8b7c2a1-4d5f-4a9b-9c1e-111111111111'
      : 'e8b7c2a1-4d5f-4a9b-9c1e-222222222222',
    deleteAppDataOnUninstall: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true
  }
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
