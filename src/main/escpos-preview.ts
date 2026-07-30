/** Extrai texto legível de bytes ESC/POS (aprox. para preview na UI). */
export function previewFromEscPos(bytes: Buffer): string {
  const lines: string[] = []
  let cur = ''
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    if (b === 0x1b) {
      // ESC …
      const next = bytes[i + 1]
      if (next === 0x40) {
        // ESC @ init
        i += 1
        continue
      }
      if (next === 0x61 || next === 0x21 || next === 0x45 || next === 0x2d) {
        i += 2
        continue
      }
      if (next === 0x64) {
        // ESC d n — feed
        i += 2
        if (cur.trim()) lines.push(cur)
        cur = ''
        continue
      }
      i += 1
      continue
    }
    if (b === 0x1d) {
      // GS …
      const next = bytes[i + 1]
      if (next === 0x56) {
        i += 2
        continue
      }
      i += 1
      continue
    }
    if (b === 0x0a) {
      lines.push(cur)
      cur = ''
      continue
    }
    if (b === 0x0d) continue
    if (b >= 0x20 && b < 0x7f) {
      cur += String.fromCharCode(b)
    } else if (b >= 0xa0) {
      // latin-ish
      cur += String.fromCharCode(b)
    }
  }
  if (cur.trim()) lines.push(cur)
  const text = lines.join('\n').trim()
  return text || '(cupom sem texto legível)'
}
