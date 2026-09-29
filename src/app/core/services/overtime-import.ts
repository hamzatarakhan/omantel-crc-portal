import { findHeader, num, readWorkbookSheets } from './xlsx-read';

export interface OvertimeEmployeeRow {
  sn?: number; name: string; employeeId: string; residentId?: string; queue: string; userId?: string;
  performance?: number; hours: number; basic: number; premium: number; days: number; hoursPerDay: number; amount: number;
}

export interface OvertimeImport { fileName: string; rows: OvertimeEmployeeRow[]; total: number }

/** Reads the vendor's monthly overtime workbook (one row per employee, with their own hours and payment) entirely in the browser. */
export async function parseOvertimeFile(file: File): Promise<OvertimeImport> {
  const { sheets } = await readWorkbookSheets(file);
  const sheet = sheets.map((rows) => ({ rows, hdr: findHeader(rows, (l) => l.some((x) => x.includes('overtime hours')) && l.some((x) => x.includes('employees name'))) })).find((s) => s.hdr);
  if (!sheet?.hdr) throw new Error('This does not look like an overtime workbook: no employee overtime sheet was found.');
  const { rows, hdr } = sheet;
  const col = (pattern: RegExp) => Object.entries(hdr.h).find(([l]) => pattern.test(l))?.[1];
  const cSn = col(/^sn$/), cName = col(/employees name/), cId = col(/infoline id/), cResident = col(/resident id/), cQueue = col(/^queue$/), cUser = col(/user ?id/),
    cPerf = col(/performance/), cHours = col(/overtime hours/), cBasic = col(/^basic/), cPct = col(/percentage/), cDays = col(/^days$/), cHrsDay = col(/^hours/), cAmount = col(/total ot payment/);

  const out: OvertimeEmployeeRow[] = [];
  for (const r of rows.slice(hdr.i + 1)) {
    const id = cId ? r.cells[cId] : undefined;
    if (!id || !/^\d+$/.test(id)) continue;
    out.push({
      sn: cSn ? num(r.cells[cSn]) : undefined, name: (cName ? r.cells[cName] : '')?.trim() ?? '', employeeId: id.trim(), residentId: cResident ? r.cells[cResident] : undefined,
      queue: (cQueue ? r.cells[cQueue] : '') ?? '', userId: cUser ? r.cells[cUser] : undefined, performance: cPerf ? num(r.cells[cPerf]) : undefined,
      hours: num(cHours ? r.cells[cHours] : undefined), basic: num(cBasic ? r.cells[cBasic] : undefined), premium: num(cPct ? r.cells[cPct] : undefined),
      days: num(cDays ? r.cells[cDays] : undefined), hoursPerDay: num(cHrsDay ? r.cells[cHrsDay] : undefined), amount: num(cAmount ? r.cells[cAmount] : undefined),
    });
  }
  const total = Math.round(out.reduce((s, r) => s + r.amount, 0) * 1000) / 1000;
  return { fileName: file.name, rows: out, total };
}
