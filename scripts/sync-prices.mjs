import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = process.argv[2];

if (!sourcePath) {
  throw new Error('Indica la ruta del Excel: npm run sync-prices -- "C:\\ruta\\precios.xlsx"');
}

const menuAliases = new Map([
  ['canaestrella', 'Caña'],
  ['cana1906', 'Caña 1906'],
  ['canonestrella', 'Cañón'],
  ['canon1906', 'Cañón 1906'],
  ['botellinestrella', 'Botellín'],
  ['botellinestrellasg', 'Botellín Estrella sin gluten'],
  ['tercioestrella', 'Tercio'],
  ['tercio', 'Tercio sin marca'],
  ['premiumipa', 'Premium IPA'],
  ['irishcoffe', 'Irish Coffee'],
  ['hendricks', "Hendrick's"],
  ['barcelo', 'Barceló'],
  ['bacardi', 'Bacardi Carta Blanca'],
  ['captainmorgan', 'Capitán Morgan'],
  ['ballantines', "Ballantine's"],
  ['baileys', "Bailey's"],
  ['licordecafe', 'Chupito licor de café'],
  ['licordehierbas', 'Licor de hierbas'],
  ['izaguirre', 'Vermut Izaguirre'],
  ['refresco', 'Coca-Cola'],
  ['cocacolazero', 'Coca-Cola Zero'],
  ['cocacolazerozero', 'Coca-Cola Zero Zero'],
  ['fantalimon', 'Fanta Limón'],
  ['fuzelimon', 'Fuze Limón'],
  ['tonica', 'Tónica'],
  ['patata', 'Patatas'],
  ['tortillapatatas', 'Tortilla de patatas'],
  ['croquetasdejamon', 'Croquetas de jamón'],
  ['lomoqueso', 'Lomo y queso'],
  ['lomopimiento', 'Lomo y pimiento'],
  ['baconqueso', 'Bacon y queso'],
  ['panunidad', 'Pan unidad'],
  ['zumos', 'Zumo'],
]);

const promotionSources = {
  'desayuno-salmantino': 'Desayuno Salmantino',
  'desayuno-fuerte': 'Desayuno Fuerte',
  'dos-canas-y-bravas': 'Dos cañas y bravas',
  'pack-partido': 'Pack Partido (2 personas)',
  'previa-alameda': 'Previa Alameda (4 amigos)',
  'vermut-alameda': 'Vermut Alameda',
  'picoteo-para-4': 'Picoteo para 4',
  'cubo-5-botellines': 'Cubo 5 Botellines',
  'mesa-universitaria': 'Mesa Universitaria',
  'aperitivo-inauguracion': 'Aperitivo de inauguración',
  'chupito-disfrazado': 'Chupito disfrazado',
  'ronda-4-halloween': 'Ronda de 4 Halloween',
  'ronda-gratis-sorteo': 'Ronda gratis (sorteo)',
};

const normalize = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9]/g, '');

const numberCellValue = (cell, description) => {
  const value = Number(cell);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${description} debe ser un número igual o mayor que cero.`);
  }
  return value;
};

const formatMenuPrice = (price) => {
  const cents = Math.round(price * 10) * 10;
  return `${(cents / 100).toLocaleString('es-ES', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}€`;
};

const asArray = (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);
const textValue = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'object') return String(value);
  if ('#text' in value) return String(value['#text']);
  return '';
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
});

const workbookBytes = new Uint8Array(await readFile(path.resolve(sourcePath)));
const archive = unzipSync(workbookBytes);
const readXml = (entryName) => {
  const bytes = archive[entryName];
  if (!bytes) throw new Error(`No se encontró "${entryName}" dentro del Excel.`);
  return parser.parse(new TextDecoder().decode(bytes));
};

const workbookXml = readXml('xl/workbook.xml');
const relationshipsXml = readXml('xl/_rels/workbook.xml.rels');
const relationships = new Map(
  asArray(relationshipsXml.Relationships.Relationship).map((relationship) => [
    relationship['@_Id'],
    relationship['@_Target'],
  ])
);
const workbookSheets = asArray(workbookXml.workbook.sheets.sheet);
const worksheetPath = (sheetName) => {
  const sheet = workbookSheets.find((candidate) => candidate['@_name'] === sheetName);
  if (!sheet) return null;
  const target = relationships.get(sheet['@_r:id']);
  if (!target) throw new Error(`No se encontró la ruta de la hoja "${sheetName}" en el Excel.`);
  return target.startsWith('/')
    ? target.slice(1)
    : path.posix.normalize(path.posix.join('xl', target));
};

const sharedStringsPath = 'xl/sharedStrings.xml';
const sharedStrings = archive[sharedStringsPath]
  ? asArray(readXml(sharedStringsPath).sst.si).map((sharedString) => {
      if (sharedString.t !== undefined) return textValue(sharedString.t);
      return asArray(sharedString.r)
        .map((run) => textValue(run.t))
        .join('');
    })
  : [];

const columnNumberFromReference = (reference) => {
  const letters = reference.match(/^[A-Z]+/)?.[0];
  if (!letters) throw new Error(`Referencia de celda no válida: "${reference}".`);
  return [...letters].reduce((number, letter) => number * 26 + letter.charCodeAt(0) - 64, 0);
};

const cellValue = (cell) => {
  if (!cell) return '';
  if (cell['@_t'] === 'inlineStr') {
    const inline = cell.is;
    if (inline?.t !== undefined) return textValue(inline.t);
    return asArray(inline?.r)
      .map((run) => textValue(run.t))
      .join('');
  }
  if (cell.v === undefined) return '';
  if (cell['@_t'] === 's') return sharedStrings[Number(cell.v)] ?? '';
  return cell.v;
};

const readWorksheet = (sheetName) => {
  const entryName = worksheetPath(sheetName);
  if (!entryName) throw new Error(`El Excel debe contener la hoja "${sheetName}".`);
  const document = readXml(entryName);
  return asArray(document.worksheet.sheetData.row).map((row) => {
    const cells = new Map(
      asArray(row.c).map((cell) => [
        columnNumberFromReference(cell['@_r']),
        cellValue(cell),
      ])
    );
    return {
      rowNumber: Number(row['@_r']),
      cells,
      getCell: (columnNumber) => cells.get(columnNumber) ?? '',
    };
  });
};

const productsRows = readWorksheet('Productos');
const promotionsRows = readWorksheet('Promos');

const getWorkbookColumns = (rows, sheetName, headerRowNumber, requiredHeaders) => {
  const headerRow = rows.find((row) => row.rowNumber === headerRowNumber);
  if (!headerRow) throw new Error(`No se encontró la fila de encabezados de "${sheetName}".`);

  const columns = new Map(
    [...headerRow.cells.entries()].map(([column, value]) => [normalize(value), column])
  );

  return Object.fromEntries(
    requiredHeaders.map((header) => {
      const column = columns.get(normalize(header));
      if (!column) {
        throw new Error(`No se encontró la columna "${header}" en la hoja "${sheetName}".`);
      }
      return [header, column];
    })
  );
};

const menuCellValue = (row, columnNumber) => row.getCell(columnNumber);
const worksheetRows = (rows) => rows.filter((row) => row.rowNumber >= 3);

const productColumns = getWorkbookColumns(productsRows, 'Productos', 2, [
  'Producto',
  'Precio_Sug',
]);
const menuPrices = { 'DYC 8 años': '8€' };
const sourceProductPrices = new Map();

for (const row of worksheetRows(productsRows)) {
  const sourceName = textValue(menuCellValue(row, productColumns.Producto)).trim();
  if (!sourceName) continue;

  const sourceKey = normalize(sourceName);
  const price = numberCellValue(
    menuCellValue(row, productColumns.Precio_Sug),
    `Precio_Sug de "${sourceName}" (Productos, fila ${row.rowNumber})`
  );
  const previousPrice = sourceProductPrices.get(sourceKey);
  if (previousPrice !== undefined && previousPrice !== price) {
    throw new Error(`El producto "${sourceName}" aparece con precios distintos en Productos.`);
  }
  sourceProductPrices.set(sourceKey, price);

  const menuName = menuAliases.get(sourceKey) ?? sourceName;
  const menuPrice = formatMenuPrice(price);
  if (menuPrices[menuName] && menuPrices[menuName] !== menuPrice) {
    throw new Error(`Más de un producto del Excel corresponde a "${menuName}" con precios distintos.`);
  }
  menuPrices[menuName] = menuPrice;
}

const promotionColumns = getWorkbookColumns(promotionsRows, 'Promos', 2, [
  'Aprobación',
  'Promo',
  'Precio normal',
  'Precio promo',
]);
const approvedPromotions = new Map();

for (const row of worksheetRows(promotionsRows)) {
  const title = textValue(menuCellValue(row, promotionColumns.Promo)).trim();
  if (!title || normalize(menuCellValue(row, promotionColumns['Aprobación'])) !== 'aprobado') {
    continue;
  }
  const titleKey = normalize(title);
  if (approvedPromotions.has(titleKey)) {
    throw new Error(`La promoción aprobada "${title}" está duplicada en la hoja Promos.`);
  }

  const regularPrice = numberCellValue(
    menuCellValue(row, promotionColumns['Precio normal']),
    `Precio normal de "${title}" (Promos, fila ${row.rowNumber})`
  );
  const price = numberCellValue(
    menuCellValue(row, promotionColumns['Precio promo']),
    `Precio promo de "${title}" (Promos, fila ${row.rowNumber})`
  );
  if (price > regularPrice) {
    throw new Error(`El precio promo de "${title}" supera su precio normal.`);
  }

  approvedPromotions.set(titleKey, {
    priceCents: Math.round(price * 100),
    discount: regularPrice === 0 ? 0 : Math.round(((regularPrice - price) / regularPrice) * 100),
  });
}

const promotionPrices = {};
for (const [promotionId, sourceTitle] of Object.entries(promotionSources)) {
  const promotion = approvedPromotions.get(normalize(sourceTitle));
  if (!promotion) {
    throw new Error(`No se encontró la promoción aprobada "${sourceTitle}" en la hoja Promos.`);
  }
  promotionPrices[promotionId] = promotion;
}

const output = `export const spreadsheetPrices = ${JSON.stringify(
  { menu: menuPrices, promotions: promotionPrices },
  null,
  2
)} as const;\n`;
const outputPath = path.join(root, 'src', 'data', 'prices.generated.ts');
await writeFile(outputPath, output, 'utf8');

console.log(`Precios públicos generados en ${path.relative(root, outputPath)}.`);
console.log(`Productos: ${Object.keys(menuPrices).length}; promociones: ${Object.keys(promotionPrices).length}.`);
