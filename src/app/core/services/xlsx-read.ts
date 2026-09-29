import { strFromU8, unzipSync } from 'fflate';

export type Cells = Record<string, string>;
export interface SheetRow { n: number; cells: Cells }

export const num = (s?: string) => {
  const v = parseFloat(s ?? '');
  return isNaN(v) ? 0 : v;
};

/** Excel serial numbers (42379) and dd.mm.yyyy text both turn into ISO dates. */
export function iso(s?: string): string {
  if (!s) return '';
  if (/^\d{4,6}(\.\d+)?$/.test(s) && parseFloat(s) > 20000) return new Date(Math.round((parseFloat(s) - 25569) * 86400000)).toISOString().slice(0, 10);
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s.slice(0, 10);
}

export function readSheet(xml: string, shared: string[]): SheetRow[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(doc.getElementsByTagName('row'))
    .map((r) => {
      const cells: Cells = {};
      for (const c of Array.from(r.getElementsByTagName('c'))) {
        const col = (c.getAttribute('r') ?? '').replace(/\d+/g, '');
        const t = c.getAttribute('t');
        let val = c.getElementsByTagName('v')[0]?.textContent ?? '';
        if (t === 's') val = shared[+val] ?? '';
        else if (t === 'inlineStr') val = Array.from(c.getElementsByTagName('t')).map((x) => x.textContent ?? '').join('');
        val = val.trim();
        if (val !== '') cells[col] = val;
      }
      return { n: +(r.getAttribute('r') ?? 0), cells };
    })
    .filter((r) => Object.keys(r.cells).length > 0);
}

export const label = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').trim();
export const headerMap = (cells: Cells) => Object.fromEntries(Object.entries(cells).map(([col, v]) => [label(v), col]));

/** Every worksheet in the workbook, read entirely in the browser — nothing is uploaded anywhere. Sheets are in file order; recognise them by their content, not their tab name (tab names do not always match their contents). */
export async function readWorkbookSheets(file: File): Promise<{ fileName: string; sheets: SheetRow[][] }> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const text = (p: string) => (files[p] ? strFromU8(files[p]) : '');
  const sharedDoc = new DOMParser().parseFromString(text('xl/sharedStrings.xml'), 'application/xml');
  const shared = Array.from(sharedDoc.getElementsByTagName('si')).map((si) => Array.from(si.getElementsByTagName('t')).map((t) => t.textContent ?? '').join(''));
  const sheets = Object.keys(files)
    .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))
    .sort()
    .map((p) => readSheet(text(p), shared));
  return { fileName: file.name, sheets };
}

/** Finds a sheet by testing its first few rows' text against `test`; returns the header row's index and column map. */
export function findHeader(rows: SheetRow[], test: (labels: string[]) => boolean) {
  const i = rows.slice(0, 10).findIndex((r) => test(Object.values(r.cells).map(label)));
  return i < 0 ? undefined : { i, h: headerMap(rows[i].cells) };
}

/** A label's value one or more rows below it, in the same column — for a workbook where a band of headers sits above a band of values (e.g. "Total Calls Offered" over 132032). */
export function valueBelow(rows: SheetRow[], pattern: RegExp): string | undefined {
  for (let i = 0; i < rows.length; i++) {
    for (const [col, v] of Object.entries(rows[i].cells)) {
      if (pattern.test(label(v))) {
        for (let j = i + 1; j < rows.length; j++) if (rows[j].cells[col] !== undefined) return rows[j].cells[col];
      }
    }
  }
  return undefined;
}

/** A label's value beside it in the same row (e.g. "Invoice No." | "Jul-2026"). */
export function valueBeside(rows: SheetRow[], pattern: RegExp): string | undefined {
  for (const r of rows) {
    const cols = Object.keys(r.cells).sort();
    for (let i = 0; i < cols.length; i++) {
      if (pattern.test(label(r.cells[cols[i]])) && cols[i + 1]) return r.cells[cols[i + 1]];
    }
  }
  return undefined;
}
