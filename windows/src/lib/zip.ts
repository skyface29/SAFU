// ZIP без сжатия (для .docx) — как ZipWriter в iOS-версии
const table = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()
export function crc32(b: Uint8Array) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = table[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

export function makeZip(files: [string, Uint8Array | string][]): Uint8Array {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const [name, raw] of files) {
    const data = typeof raw === 'string' ? enc.encode(raw) : raw
    const nm = enc.encode(name)
    const crc = crc32(data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true)
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, nm.length, true)
    parts.push(new Uint8Array(local.buffer), nm, data)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true)
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, offset, true)
    central.push(new Uint8Array(c.buffer), nm)
    offset += 30 + nm.length + data.length
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true)
  const all = [...parts, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0))
  let p = 0
  for (const a of all) { out.set(a, p); p += a.length }
  return out
}

export const toBase64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s) }

// ---------- титульный лист .docx по СТО САФУ ----------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
function p(text: string, o: { align?: string; bold?: boolean; size?: number; indentLeft?: number } = {}) {
  const { align = 'center', bold = false, size = 28, indentLeft = 0 } = o
  return `<w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:before="0" w:after="0" w:line="276" w:lineRule="auto"/>${indentLeft ? `<w:ind w:left="${indentLeft}"/>` : ''}</w:pPr>` +
    `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>${bold ? '<w:b/><w:bCs/>' : ''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`
}
const blank = (n: number) => p('').repeat(n)

export function titlePageDocx(o: { school: string; workTitle: string; discipline: string; topic: string; student: string; group: string; supervisor: string; position: string; year: number }) {
  let body = ''
  body += p('МИНИСТЕРСТВО НАУКИ И ВЫСШЕГО ОБРАЗОВАНИЯ РОССИЙСКОЙ ФЕДЕРАЦИИ', { size: 24 })
  body += p('федеральное государственное автономное образовательное учреждение высшего образования', { size: 24 })
  body += p('«Северный (Арктический) федеральный университет имени М.В. Ломоносова»', { bold: true, size: 24 })
  body += blank(1) + p(o.school) + blank(6) + p(o.workTitle, { bold: true, size: 32 }) + blank(1)
  if (o.discipline) body += p(`по дисциплине «${o.discipline}»`)
  if (o.topic) body += p(`на тему: «${o.topic}»`)
  body += blank(6)
  const r = (t: string) => p(t, { align: 'left', indentLeft: 5103 })
  body += r('Выполнил:') + r(`студент группы ${o.group}`) + r(o.student) + blank(1) + r('Проверил:')
  if (o.position) body += r(o.position)
  body += r(o.supervisor) + blank(7) + p(`Архангельск ${o.year}`)
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="567" w:bottom="1134" w:left="1701" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`
  const types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  return makeZip([['[Content_Types].xml', types], ['_rels/.rels', rels], ['word/document.xml', document]])
}
