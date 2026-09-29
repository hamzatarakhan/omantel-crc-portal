import { Agent, AnnexureImport, PayrollLine } from '../models/domain';
import { Cells, SheetRow, headerMap, iso, label, num, readSheet, readWorkbookSheets } from './xlsx-read';

function degree(s?: string): Agent['degree'] {
  const t = (s ?? '').toLowerCase().replace(/\s/g, '');
  return t.startsWith('non') ? 'Non-Diploma' : t.startsWith('bach') ? 'Bachelor' : 'Diploma';
}

const isId = (v?: string) => !!v && /^\d{3,}$/.test(v);

function payFrom(c: Cells, h: Record<string, string>): PayrollLine {
  const g = (name: string) => num(c[h[name]]);
  const gross = g('gross') || g('basic salary') + g('house rent allowance') + g('conveyance allowance') + g('special allowance (fixed)') + g('other allowances');
  const managementFee = g('management fees') || g('management fee') || 116;
  const additional = g('additional');
  const deduction = g('deduction');
  const rateCell = c[h['billing rate']];
  return {
    residentId: c[h['resident id']] ?? '',
    basic: g('basic salary'), hra: g('house rent allowance'), conveyance: g('conveyance allowance'),
    special: g('special allowance (fixed)'), other: g('other allowances'),
    gross, managementFee, additional, deduction,
    // the sheet's own billing rate wins (it can be zero for someone on unpaid leave)
    billingRate: rateCell !== undefined ? num(rateCell) : gross + managementFee + additional - deduction,
  };
}

/** Reads the vendor's monthly annexure workbook entirely in the browser — nothing is uploaded anywhere. */
export async function parseAnnexure(file: File): Promise<AnnexureImport> {
  const { sheets } = await readWorkbookSheets(file);

  // The tab names in the workbook do not match their contents, so sheets are recognised by their header labels.
  const findHeader = (rows: SheetRow[], test: (labels: string[]) => boolean) => {
    const i = rows.slice(0, 8).findIndex((r) => test(Object.values(r.cells).map(label)));
    return i < 0 ? undefined : { i, h: headerMap(rows[i].cells) };
  };

  const employeesSheet = sheets.map((rows) => ({ rows, hdr: findHeader(rows, (l) => l.includes('employees name') && l.includes('nationality') && l.includes('basic salary')) })).find((s) => s.hdr);
  if (!employeesSheet?.hdr) throw new Error('This does not look like the annexure workbook: no employee billing-rate sheet was found.');
  const { rows: empRows, hdr: eh } = { rows: employeesSheet.rows, hdr: employeesSheet.hdr };

  const employees: AnnexureImport['employees'] = [];
  for (const r of empRows.slice(eh.i + 1)) {
    const c = r.cells;
    if (!isId(c[eh.h['employee id']])) continue;
    employees.push({
      employeeId: c[eh.h['employee id']], name: c[eh.h['employees name']] ?? '', queue: c[eh.h['queue']] ?? '',
      degree: degree(c[eh.h['degree']]), nationality: c[eh.h['nationality']] ?? 'Oman', joinDate: iso(c[eh.h['date of joining']]), pay: payFrom(c, eh.h),
    });
  }

  // attendance grid: header row + a row of date serials, then one row per employee
  const attendanceSheet = sheets.map((rows) => ({ rows, hdr: findHeader(rows, (l) => l.includes('employees name') && l.includes('queue') && l.includes('degree') && l.includes('employee id') && l.includes('resident id')) }))
    .find((s) => s.hdr && s.rows[s.hdr.i + 1] && Object.values(s.rows[s.hdr.i + 1].cells).some((v) => parseFloat(v) > 40000));
  const attendance: AnnexureImport['attendance'] = { days: [], rows: {} };
  const attMeta: Record<string, { queue: string; degree: Agent['degree'] }> = {};
  if (attendanceSheet?.hdr) {
    const { rows, hdr } = attendanceSheet;
    const dateRow = rows[hdr.i + 1].cells;
    const dayCols = Object.entries(dateRow).filter(([, v]) => parseFloat(v) > 40000).map(([col]) => col);
    attendance.days = dayCols.map((col) => iso(dateRow[col]));
    for (const r of rows.slice(hdr.i + 2)) {
      const id = r.cells[hdr.h['employee id']];
      if (!isId(id)) continue;
      attendance.rows[id] = dayCols.map((col) => r.cells[col] || 'OFF');
      attMeta[id] = { queue: r.cells[hdr.h['queue']] ?? '', degree: degree(r.cells[hdr.h['degree']]) };
    }
  }

  // new joiners: not in the payroll list, but billed pro-rata
  const joinersSheet = sheets.map((rows) => ({ rows, hdr: findHeader(rows, (l) => l.includes('employees name') && l.includes('date of joining') && l.includes('basic salary') && !l.includes('nationality')) })).find((s) => s.hdr);
  if (joinersSheet?.hdr) {
    const { rows, hdr } = joinersSheet;
    for (const r of rows.slice(hdr.i + 1)) {
      const c = r.cells;
      const id = c[hdr.h['employee id']];
      if (!isId(id) || employees.some((e) => e.employeeId === id)) continue;
      employees.push({ employeeId: id, name: c[hdr.h['employees name']] ?? '', queue: attMeta[id]?.queue || 'New joiner', degree: attMeta[id]?.degree ?? 'Diploma', nationality: 'Oman', joinDate: iso(c[hdr.h['date of joining']]), pay: payFrom(c, hdr.h) });
    }
  }

  const resignationSheet = sheets.map((rows) => ({ rows, hdr: findHeader(rows, (l) => l.includes('dor') && l.includes('leave encashment')) })).find((s) => s.hdr);
  const resignations: AnnexureImport['resignations'] = [];
  if (resignationSheet?.hdr) {
    const { rows, hdr } = resignationSheet;
    for (const r of rows.slice(hdr.i + 1)) {
      const c = r.cells;
      const id = c[hdr.h['employee id']];
      if (!isId(id)) continue;
      const prorated = num(c[hdr.h['pro-rated']]);
      const leaveEncashment = num(c[hdr.h['leave encashment']]);
      resignations.push({
        employeeId: id, name: c[hdr.h['employees name']] ?? '', queue: c[hdr.h['queue']] ?? '', residentId: c[hdr.h['resident id']] ?? '', degree: degree(c[hdr.h['degree']]),
        joinDate: iso(c[hdr.h['doj']]), resignDate: iso(c[hdr.h['dor']]), gross: num(c[hdr.h['gross salary']]), managementFee: num(c[hdr.h['management fee']]) || 116,
        monthlyBilling: num(c[hdr.h['monthly billing']]), prorated, absentDays: num(c[hdr.h['absentees']]), leaveEncashment, total: prorated + leaveEncashment,
      });
    }
  }

  // billing month: the invoice date if the workbook has one, otherwise the month of the last attendance day
  let periodStart = '';
  for (const rows of sheets) {
    for (const r of rows.slice(0, 15)) {
      const vals = Object.values(r.cells);
      const i = vals.findIndex((v) => label(v) === 'inv. date');
      if (i >= 0 && vals[i + 1] && parseFloat(vals[i + 1]) > 40000) periodStart = iso(vals[i + 1]).slice(0, 7) + '-01';
    }
  }
  if (!periodStart) periodStart = (attendance.days[attendance.days.length - 1] ?? new Date().toISOString().slice(0, 10)).slice(0, 7) + '-01';

  return { fileName: file.name, periodStart, employees, attendance, resignations };
}
