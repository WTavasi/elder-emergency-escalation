/**
 * A CSV file from rows, and a download of it, for the tables an administrator exports.
 *
 * Built in the browser from what the API already returned, so an export carries exactly
 * what the screen was allowed to show and nothing more.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/**
 * One cell, quoted when it has to be. A cell that starts with =, +, - or @ is prefixed
 * with an apostrophe, because a spreadsheet would otherwise run it as a formula: a name
 * typed as "=HYPERLINK(...)" is a well-known way to attack whoever opens an export.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((column) => csvCell(column.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(column.value(row))).join(','));
  }
  // CRLF and a byte-order mark, so Excel opens it as UTF-8 and names keep their accents.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Today's date, for a file name: mzazicare-history-2026-10-14.csv. */
export function stamp(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
