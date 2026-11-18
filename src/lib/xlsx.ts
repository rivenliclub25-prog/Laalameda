/**
 * Lector mínimo de archivos .xlsx en el navegador, sin librerías (RENTABILIDAD.md, R-D5).
 *
 * Un .xlsx es un ZIP con XML dentro: se abre con DecompressionStream («deflate-raw») y DOMParser,
 * que traen los navegadores actuales. Solo lee valores (texto y números tal cual los guarda Excel):
 * ni fórmulas ni formatos. El archivo no sale del navegador.
 */

export interface FilaHoja {
  /** Número de fila en Excel (1, 2, 3…). */
  numero: number;
  /** Valor de cada celda por su columna («A», «B»…). Los números llegan como texto («18.5»). */
  celdas: Record<string, string>;
}

export interface LibroExcel {
  hojas: string[];
  filas: (hoja: string) => FilaHoja[];
}

const MAX_ARCHIVO = 15 * 1024 * 1024;
const MAX_DESCOMPRIMIDO = 60 * 1024 * 1024;

export class ErrorExcel extends Error {}

interface EntradaZip {
  metodo: number;
  comprimido: number;
  tamano: number;
  offsetLocal: number;
}

function leerDirectorio(buf: ArrayBuffer): Map<string, EntradaZip> {
  const dv = new DataView(buf);
  // Fin del directorio central: firma 0x06054b50, en los últimos 64 KB.
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65_557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ErrorExcel('El archivo no es un Excel (.xlsx) válido.');
  const total = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entradas = new Map<string, EntradaZip>();
  for (let n = 0; n < total; n++) {
    if (p + 46 > buf.byteLength || dv.getUint32(p, true) !== 0x02014b50) throw new ErrorExcel('El Excel está dañado.');
    const metodo = dv.getUint16(p + 10, true);
    const comprimido = dv.getUint32(p + 20, true);
    const tamano = dv.getUint32(p + 24, true);
    const largoNombre = dv.getUint16(p + 28, true);
    const largoExtra = dv.getUint16(p + 30, true);
    const largoComentario = dv.getUint16(p + 32, true);
    const offsetLocal = dv.getUint32(p + 42, true);
    const nombre = decoder.decode(new Uint8Array(buf, p + 46, largoNombre));
    if (comprimido === 0xffffffff || tamano === 0xffffffff) throw new ErrorExcel('El Excel es demasiado grande.');
    entradas.set(nombre, { metodo, comprimido, tamano, offsetLocal });
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return entradas;
}

async function extraer(buf: ArrayBuffer, e: EntradaZip): Promise<string> {
  const dv = new DataView(buf);
  if (dv.getUint32(e.offsetLocal, true) !== 0x04034b50) throw new ErrorExcel('El Excel está dañado.');
  const inicio = e.offsetLocal + 30 + dv.getUint16(e.offsetLocal + 26, true) + dv.getUint16(e.offsetLocal + 28, true);
  if (e.tamano > MAX_DESCOMPRIMIDO) throw new ErrorExcel('El Excel es demasiado grande.');
  const datos = new Uint8Array(buf, inicio, e.comprimido);
  let bytes: Uint8Array;
  if (e.metodo === 0) bytes = datos;
  else if (e.metodo === 8) {
    if (typeof DecompressionStream === 'undefined') {
      throw new ErrorExcel('Este navegador no puede leer Excel. Usa Chrome, Edge, Safari o Firefox actualizados.');
    }
    const stream = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  } else throw new ErrorExcel('El Excel usa una compresión que no se puede leer.');
  return new TextDecoder().decode(bytes);
}

function xml(texto: string): Document {
  const doc = new DOMParser().parseFromString(texto, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) throw new ErrorExcel('El Excel está dañado.');
  return doc;
}

const porNombre = (raiz: Document | Element, tag: string) => Array.from(raiz.getElementsByTagNameNS('*', tag));
const textoDe = (el: Element) => porNombre(el, 't').map((t) => t.textContent ?? '').join('');

export async function leerExcel(archivo: File): Promise<LibroExcel> {
  if (archivo.size > MAX_ARCHIVO) throw new ErrorExcel('El archivo es demasiado grande (máximo 15 MB).');
  const buf = await archivo.arrayBuffer();
  const zip = leerDirectorio(buf);
  const leer = async (ruta: string) => {
    const e = zip.get(ruta);
    if (!e) throw new ErrorExcel('El archivo no es un Excel (.xlsx) válido.');
    return xml(await extraer(buf, e));
  };

  const libro = await leer('xl/workbook.xml');
  const rels = await leer('xl/_rels/workbook.xml.rels');
  const destinos = new Map(porNombre(rels, 'Relationship').map((r) => [r.getAttribute('Id'), r.getAttribute('Target') ?? '']));
  const hojas = porNombre(libro, 'sheet').map((s) => {
    const destino = destinos.get(s.getAttribute('r:id')) ?? '';
    const ruta = destino.startsWith('/') ? destino.slice(1) : `xl/${destino}`;
    return { nombre: s.getAttribute('name') ?? '', ruta };
  });

  const compartidos = zip.has('xl/sharedStrings.xml') ? porNombre(await leer('xl/sharedStrings.xml'), 'si').map(textoDe) : [];

  const contenido = new Map<string, FilaHoja[]>();
  for (const h of hojas) {
    if (!zip.has(h.ruta)) continue;
    const doc = await leer(h.ruta);
    const filas: FilaHoja[] = [];
    for (const row of porNombre(doc, 'row')) {
      const numero = Number(row.getAttribute('r'));
      const celdas: Record<string, string> = {};
      for (const c of porNombre(row, 'c')) {
        const col = (c.getAttribute('r') ?? '').replace(/\d+/g, '');
        const tipo = c.getAttribute('t');
        const v = porNombre(c, 'v')[0]?.textContent ?? null;
        let valor: string | null = null;
        if (tipo === 's') valor = v === null ? null : (compartidos[Number(v)] ?? null);
        else if (tipo === 'inlineStr') valor = textoDe(c);
        else valor = v;
        if (col && valor !== null && valor !== '') celdas[col] = valor;
      }
      if (Number.isFinite(numero) && Object.keys(celdas).length > 0) filas.push({ numero, celdas });
    }
    contenido.set(h.nombre, filas);
  }

  return { hojas: hojas.map((h) => h.nombre), filas: (hoja) => contenido.get(hoja) ?? [] };
}
