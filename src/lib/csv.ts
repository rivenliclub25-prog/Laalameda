/**
 * CSV para Excel en español: separado por ";", con BOM UTF-8 (tildes bien) y protegido contra la
 * "inyección de fórmulas": si un texto empieza por =, @, + o - (seguido de algo que no sea un
 * número), Excel podría ejecutarlo como fórmula, así que se antepone una comilla simple.
 */
export type CsvValue = string | number | boolean | null | undefined;

export function csvCell(value: CsvValue) {
  let text = value === null || value === undefined ? '' : typeof value === 'boolean' ? (value ? 'Sí' : 'No') : String(value);
  if (/^[=@\t\r]/.test(text) || /^[+-][^\d]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Marca de orden de bytes (BOM) para que Excel reconozca el UTF-8. */
const BOM = String.fromCharCode(0xfeff);

export function toCsv(header: string[], rows: CsvValue[][]) {
  return BOM + [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
}

/** Importe en euros con coma decimal ("12,50"), para que Excel lo sume. */
export function csvEuros(cents: number | null | undefined) {
  return cents === null || cents === undefined ? '' : (cents / 100).toFixed(2).replace('.', ',');
}

export function saveCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
