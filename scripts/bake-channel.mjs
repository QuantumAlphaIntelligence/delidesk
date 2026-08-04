#!/usr/bin/env node
/**
 * Lê env.sandbox | env.production e grava resources/channel.json
 * para electron-builder (extraResources) embutir no instalador.
 *
 * Uso: node scripts/bake-channel.mjs sandbox|prod
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const arg = (process.argv[2] || '').toLowerCase()
const channel = arg === 'prod' || arg === 'production' ? 'prod' : arg === 'sandbox' ? 'sandbox' : null
if (!channel) {
  console.error('Uso: node scripts/bake-channel.mjs sandbox|prod')
  process.exit(1)
}

const envFile = channel === 'prod' ? 'env.production' : 'env.sandbox'
const envPath = join(root, envFile)
if (!existsSync(envPath)) {
  console.error(`Arquivo não encontrado: ${envFile}`)
  process.exit(1)
}

/** @type {Record<string, string>} */
const baked = { channel, DELIDESK_CHANNEL: channel }

for (const raw of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const line = raw.trim()
  if (!line || line.startsWith('#')) continue
  const eq = line.indexOf('=')
  if (eq <= 0) continue
  const key = line.slice(0, eq).trim()
  let value = line.slice(eq + 1).trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }
  if (key.startsWith('DELIDESK_')) {
    baked[key] = value
  }
}

const apiBase = (baked.DELIDESK_API_URL || '').replace(/\/$/, '')
if (apiBase && !baked.DELIDESK_UPDATE_FEED_URL) {
  baked.DELIDESK_UPDATE_FEED_URL = `${apiBase}/webhook/public/delidesk-update/${channel}`
}

const outDir = join(root, 'resources')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, 'channel.json')
writeFileSync(outPath, `${JSON.stringify(baked, null, 2)}\n`, 'utf8')
console.log(`Wrote ${outPath} (channel=${channel})`)
