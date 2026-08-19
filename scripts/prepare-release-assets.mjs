#!/usr/bin/env node
/**
 * Após o NSIS: valida o .exe curto (DeliDesk-0.2.11.exe) e alinha latest.yml.
 * Legado DeliDesk-Setup-{channel}-*.exe ainda é aceito se existir.
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

const files = readdirSync(releaseDir)
const shortExe = files.find((f) => /^DeliDesk-\d+\.\d+\.\d+\.exe$/i.test(f))
const legacyExe = files.find(
  (f) =>
    f.startsWith(`DeliDesk-Setup-${channel}-`) &&
    f.endsWith('.exe') &&
    !f.endsWith('.blockmap')
)
const versionedExe = shortExe || legacyExe
if (!versionedExe) {
  console.error(
    `Nenhum DeliDesk-x.y.z.exe (nem legado DeliDesk-Setup-${channel}-*.exe) em release/`
  )
  process.exit(1)
}

console.log(`Download/update asset: ${versionedExe}`)

const ymlPath = join(releaseDir, 'latest.yml')
if (existsSync(ymlPath)) {
  let yml = readFileSync(ymlPath, 'utf8')
  // Remove aliases antigos sem versão (Setup-prod.exe) apontando pro versionado.
  const legacyStable = `DeliDesk-Setup-${channel}.exe`
  if (yml.includes(legacyStable)) {
    yml = yml.replace(new RegExp(legacyStable.replace(/\./g, '\\.'), 'g'), versionedExe)
    writeFileSync(ymlPath, yml, 'utf8')
    console.log(`Rewrote latest.yml paths → ${versionedExe}`)
  } else {
    console.log('latest.yml já aponta para artefato versionado')
  }
} else {
  console.warn('Aviso: latest.yml não gerado — confira publish no electron-builder')
}

console.log('Release assets prontos em release/')
