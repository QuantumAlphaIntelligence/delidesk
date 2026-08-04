#!/usr/bin/env node
/**
 * Após o NSIS: copia artefato versionado para nome estável do canal e
 * reescreve latest.yml (path → exe estável) para o feed do electron-updater.
 *
 * Uso: node scripts/prepare-release-assets.mjs sandbox|prod
 */
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const channel = (process.argv[2] || '').toLowerCase()
if (channel !== 'sandbox' && channel !== 'prod') {
  console.error('Uso: node scripts/prepare-release-assets.mjs sandbox|prod')
  process.exit(1)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = join(root, 'release')
if (!existsSync(releaseDir)) {
  console.error('Pasta release/ não encontrada')
  process.exit(1)
}

const versionedPrefix = `DeliDesk-Setup-${channel}-`
const stableName = `DeliDesk-Setup-${channel}.exe`
const files = readdirSync(releaseDir)

const versionedExe = files.find(
  (f) => f.startsWith(versionedPrefix) && f.endsWith('.exe') && !f.endsWith('.blockmap')
)
if (!versionedExe) {
  console.error(`Nenhum ${versionedPrefix}*.exe em release/`)
  process.exit(1)
}

const versionedPath = join(releaseDir, versionedExe)
const stablePath = join(releaseDir, stableName)
copyFileSync(versionedPath, stablePath)
console.log(`Stable copy: ${versionedExe} → ${stableName}`)

const blockmapSrc = `${versionedExe}.blockmap`
if (files.includes(blockmapSrc)) {
  copyFileSync(join(releaseDir, blockmapSrc), join(releaseDir, `${stableName}.blockmap`))
  console.log(`Stable blockmap: ${stableName}.blockmap`)
}

const ymlName = 'latest.yml'
const ymlPath = join(releaseDir, ymlName)
if (existsSync(ymlPath)) {
  let yml = readFileSync(ymlPath, 'utf8')
  yml = yml.replace(new RegExp(versionedExe.replace(/\./g, '\\.'), 'g'), stableName)
  writeFileSync(ymlPath, yml, 'utf8')
  console.log(`Rewrote ${ymlName} paths → ${stableName}`)
} else {
  console.warn(`Aviso: ${ymlName} não gerado — confira publish no electron-builder`)
}

console.log('Release assets prontos em release/')
