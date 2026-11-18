/**
 * Generador mínimo de archivos .xlsx en el navegador, sin librerías (RENTABILIDAD.md, R3).
 *
 * Un .xlsx es un ZIP con XML dentro. Se guarda sin comprimir (método «stored»), que todos los
 * programas abren, con textos en línea, números de verdad (para poder hacer cuentas), la fila de
 * títulos en negrita y fija, y anchos de columna.
 */

export type FormatoColumna = 'texto' | 'num' | 'eur' | 'eur4' | 'pct';

export interface ColumnaExcel {
  titulo: string;
  formato?: FormatoColumna;
  /** Ancho en caracteres. */
  ancho?: number;
}

export interface HojaExcel {
  nombre: string;
  columnas: ColumnaExcel[];
  filas: (string | number | null | undefined)[][];
  /** Líneas de texto antes de la tabla (p. ej. el periodo). */
  notas?: string[];
}

// Estilos: 0 normal · 1 títulos · 2 número · 3 euros · 4 euros con 4 decimales · 5 porcentaje (63,7 → «63,7 %»)
const ESTILO: Record<FormatoColumna, number> = { texto: 0, num: 2, eur: 3, eur4: 4, pct: 5 };

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4"><numFmt numFmtId="164" formatCode="#,##0.###"/><numFmt numFmtId="165" formatCode="#,##0.00\\ &quot;€&quot;"/><numFmt numFmtId="166" formatCode="#,##0.0000\\ &quot;€&quot;"/><numFmt numFmtId="167" formatCode="0.0\\ &quot;%&quot;"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const esc = (s: string) =>
  s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const columna = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

function celda(ref: string, valor: string | number | null | undefined, estilo: number): string {
  if (valor === null || valor === undefined || valor === '') return '';
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return '';
    return `<c r="${ref}"${estilo ? ` s="${estilo}"` : ''}><v>${valor}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${estilo === 1 ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(valor)}</t></is></c>`;
}

function hojaXml(h: HojaExcel): string {
  const filas: string[] = [];
  let r = 1;
  for (const nota of h.notas ?? []) filas.push(`<row r="${r}">${celda(`A${r++}`, nota, 0)}</row>`);
  if (h.notas?.length) r++;
  const filaTitulos = r;
  filas.push(`<row r="${r}">${h.columnas.map((c, i) => celda(`${columna(i)}${r}`, c.titulo, 1)).join('')}</row>`);
  r++;
  for (const fila of h.filas) {
    filas.push(`<row r="${r}">${h.columnas.map((c, i) => celda(`${columna(i)}${r}`, fila[i], ESTILO[c.formato ?? 'texto'])).join('')}</row>`);
    r++;
  }
  const cols = h.columnas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.ancho ?? 14}" customWidth="1"/>`).join('');
  const panel = `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${filaTitulos}" topLeftCell="A${filaTitulos + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${panel}<cols>${cols}</cols><sheetData>${filas.join('')}</sheetData></worksheet>`;
}

// ---- ZIP sin comprimir ----

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(archivos: { nombre: string; datos: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const a of archivos) {
    const nombre = enc.encode(a.nombre);
    const crc = crc32(a.datos);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nombres en UTF-8
    local.setUint16(8, 0, true); // sin comprimir
    local.setUint16(12, 0x21, true); // fecha DOS mínima (1980-01-01)
    local.setUint32(14, crc, true);
    local.setUint32(18, a.datos.length, true);
    local.setUint32(22, a.datos.length, true);
    local.setUint16(26, nombre.length, true);
    partes.push(new Uint8Array(local.buffer), nombre, a.datos);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(14, 0x21, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, a.datos.length, true);
    cd.setUint32(24, a.datos.length, true);
    cd.setUint16(28, nombre.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nombre);
    offset += 30 + nombre.length + a.datos.length;
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, archivos.length, true);
  fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true);
  fin.setUint32(16, offset, true);
  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const out = new Uint8Array(todo.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const t of todo) {
    out.set(t, p);
    p += t.length;
  }
  return out;
}

/** Nombre de hoja válido para Excel: sin []:*?/\ y como mucho 31 caracteres, sin repetir. */
function nombresHoja(hojas: HojaExcel[]): string[] {
  const usados = new Set<string>();
  return hojas.map((h, i) => {
    let n = h.nombre.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || `Hoja ${i + 1}`;
    while (usados.has(n.toLowerCase())) n = `${n.slice(0, 28)} ${i + 1}`;
    usados.add(n.toLowerCase());
    return n;
  });
}

export function crearExcel(hojas: HojaExcel[]): Uint8Array {
  const enc = new TextEncoder();
  const nombres = nombresHoja(hojas);
  const archivos = [
    {
      nombre: '[Content_Types].xml',
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas
        .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join('')}</Types>`,
    },
    {
      nombre: '_rels/.rels',
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      nombre: 'xl/workbook.xml',
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nombres
        .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets></workbook>`,
    },
    {
      nombre: 'xl/_rels/workbook.xml.rels',
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join('')}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { nombre: 'xl/styles.xml', xml: STYLES },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, xml: hojaXml(h) })),
  ];
  return zip(archivos.map((a) => ({ nombre: a.nombre, datos: enc.encode(a.xml) })));
}

/** Descarga el Excel en el navegador. */
export function descargarExcel(nombreArchivo: string, hojas: HojaExcel[]) {
  const blob = new Blob([crearExcel(hojas)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo.endsWith('.xlsx') ? nombreArchivo : `${nombreArchivo}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
