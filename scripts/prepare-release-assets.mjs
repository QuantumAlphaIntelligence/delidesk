#!/usr/bin/env node
/**
 * Após o NSIS: mantém o .exe versionado (ex.: DeliDesk-Setup-prod-0.2.10.exe)
 * como artefato oficial do download — evita "DeliDesk-Setup-prod (1)" no Salvar como.
 * latest.yml continua apontando para o nome versionado (electron-updater).
 *
 * Uso: node scripts/prepare-release-assets.mjs sandbox|prod
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
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
const files = readdirSync(releaseDir)

const versionedExe = files.find(
  (f) => f.startsWith(versionedPrefix) && f.endsWith('.exe') && !f.endsWith('.blockmap')
)
if (!versionedExe) {
  console.error(`Nenhum ${versionedPrefix}*.exe em release/`)
  process.exit(1)
}

console.log(`Download/update asset: ${versionedExe}`)

const ymlName = 'latest.yml'
const ymlPath = join(releaseDir, ymlName)
if (existsSync(ymlPath)) {
  // Garante que o feed usa o nome versionado (não o alias sem versão).
  let yml = readFileSync(ymlPath, 'utf8')
  const stableAlias = `DeliDesk-Setup-${channel}.exe`
  if (yml.includes(stableAlias)) {
    yml = yml.replace(new RegExp(stableAlias.replace(/\./g, '\\.'), 'g'), versionedExe)
    writeFileSync(ymlPath, yml, 'utf8')
    console.log(`Rewrote ${ymlName} paths → ${versionedExe}`)
  } else {
    console.log(`${ymlName} já aponta para artefato versionado`)
  }
} else {
  console.warn(`Aviso: ${ymlName} não gerado — confira publish no electron-builder`)
}

console.log('Release assets prontos em release/')
