import { findHeader, num, readWorkbookSheets, valueBelow } from './xlsx-read';

export interface MsIncentiveCategoryRow { category: string; target: number; actual: number; achievement: number; incentive: number; status: string }
export interface MsIncentiveImport { fileName: string; month: number; rows: MsIncentiveCategoryRow[]; total: number }

/** Reads the vendor's monthly Manage Service Incentive workbook (one row per sales category) entirely in the browser. */
export async function parseMsIncentiveFile(file: File): Promise<MsIncentiveImport> {
  const { sheets } = await readWorkbookSheets(file);
  const sheet = sheets.map((rows) => ({ rows, hdr: findHeader(rows, (l) => l.some((x) => x === 'category') && l.some((x) => x === 'target') && l.some((x) => x === 'incentive')) })).find((s) => s.hdr);
  if (!sheet?.hdr) throw new Error('This does not look like a Manage Service Incentive workbook: no category table was found.');
  const { rows, hdr } = sheet;
  const col = (pattern: RegExp) => Object.entries(hdr.h).find(([l]) => pattern.test(l))?.[1];
  const cCat = col(/^category$/), cTarget = col(/^target$/), cActual = col(/^actual$/), cAch = col(/achievement/), cInc = col(/^incentive$/), cStatus = col(/^status$/);

  const out: MsIncentiveCategoryRow[] = [];
  for (const r of rows.slice(hdr.i + 1)) {
    const cat = cCat ? r.cells[cCat] : undefined;
    if (!cat) break;
    out.push({
      category: cat.trim(), target: num(cTarget ? r.cells[cTarget] : undefined), actual: num(cActual ? r.cells[cActual] : undefined),
      achievement: num(cAch ? r.cells[cAch] : undefined), incentive: num(cInc ? r.cells[cInc] : undefined), status: (cStatus ? r.cells[cStatus] : '') ?? '',
    });
  }
  const month = num(valueBelow(rows, /^month$/));
  const total = Math.round(out.reduce((s, r) => s + r.incentive, 0) * 1000) / 1000;
  return { fileName: file.name, month, rows: out, total };
}
