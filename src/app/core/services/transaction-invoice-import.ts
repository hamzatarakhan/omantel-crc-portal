import { SheetRow, findHeader, headerMap, iso, label, num, readWorkbookSheets, valueBeside, valueBelow } from './xlsx-read';

export type TxChannel = 'Voice' | 'Chat';

export interface TxKpiRow {
  no?: number;
  channel?: string;
  kpi: string;
  target: number;
  actual: number;
  variance?: number;
  status: string;
  penalty: number;
  bracket?: string;
}

/** One day of the channel's daily performance sheet — kept generic (whatever columns the vendor's own template has) so nothing about it is assumed. */
export interface TxDailyRow {
  date: string;
  values: Record<string, number>;
}

export interface TransactionInvoiceImport {
  fileName: string;
  channel: TxChannel;
  invoiceNo: string;
  issueDate: string;
  servicePeriod: string;
  periodStart: string;
  rate: number;
  offered: number;
  answered: number;
  invoicedTransactions: number;
  slaPct: number;
  abandonmentPct: number;
  forecastAccuracyPct: number;
  cei: number;
  kpiPenaltyPct: number;
  forecastAccuracyEffectAmount: number;
  totalInvoicedAmount: number;
  kpiPenaltyAmount: number;
  netInvoiceAmount: number;
  kpiRows: TxKpiRow[];
  totalPenalty: number;
  dailyHeaders: string[];
  dailyRows: TxDailyRow[];
}

/** Reads the vendor's monthly transaction invoice (Voice or Non Voice/Chat) entirely in the browser — nothing is uploaded anywhere. */
export async function parseTransactionInvoice(file: File, channel: TxChannel): Promise<TransactionInvoiceImport> {
  const { sheets } = await readWorkbookSheets(file);

  const summarySheet = sheets.find((rows) => rows.slice(0, 12).some((r) => Object.values(r.cells).some((v) => label(v) === 'invoice no.')));
  if (!summarySheet) throw new Error('This does not look like a transaction invoice workbook: no Invoice Summary sheet was found.');

  const invoiceNo = valueBeside(summarySheet, /^invoice no\.?$/) ?? '';
  const issueDate = iso(valueBeside(summarySheet, /^issue date$/));
  const servicePeriod = valueBeside(summarySheet, /^service period$/) ?? '';
  const rate = num(valueBeside(summarySheet, /call rate/));
  const offered = num(valueBelow(summarySheet, /total calls offered/));
  const answered = num(valueBelow(summarySheet, /total calls answered/));
  const invoicedTransactions = num(valueBelow(summarySheet, /invoiced transactions/));
  const slaPct = num(valueBelow(summarySheet, /sla %/));
  const abandonmentPct = num(valueBelow(summarySheet, /abandonment %/));
  const forecastAccuracyPct = num(valueBelow(summarySheet, /forecast accuracy$/));
  const cei = num(valueBelow(summarySheet, /^cei/));
  const kpiPenaltyPct = num(valueBelow(summarySheet, /kpi penalties %/));
  const forecastAccuracyEffectAmount = num(valueBelow(summarySheet, /accuracy effect amount/));
  const totalInvoicedAmount = num(valueBelow(summarySheet, /total invoiced transactions amount/));
  const kpiPenaltyAmount = num(valueBelow(summarySheet, /kpi penalties amount/));
  const netInvoiceAmount = num(valueBelow(summarySheet, /net invoice amount/));
  const periodStart = (issueDate || new Date().toISOString().slice(0, 10)).slice(0, 7) + '-01';

  // KPI & Penalty: a header row naming 'kpi', 'target' and 'actual', then one row per KPI until a 'total' row.
  const kpiSheet = sheets.map((rows) => ({ rows, hdr: findHeader(rows, (l) => l.some((x) => x === 'kpi') && l.some((x) => x.includes('target')) && l.some((x) => x.includes('actual'))) })).find((s) => s.hdr);
  const kpiRows: TxKpiRow[] = [];
  let totalPenalty = 0;
  if (kpiSheet?.hdr) {
    const { rows, hdr } = kpiSheet;
    const col = (pattern: RegExp) => Object.entries(hdr.h).find(([l]) => pattern.test(l))?.[1];
    const cNo = col(/^#$/), cChannel = col(/^channel$/), cKpi = col(/^kpi$/), cTarget = col(/target/), cActual = col(/actual/), cVariance = col(/variance/), cStatus = col(/status/), cPenalty = col(/penalty/), cBracket = col(/bracket|penalt(y|ies)\/incet/);
    for (const r of rows.slice(hdr.i + 1)) {
      const first = Object.values(r.cells)[0] ?? '';
      if (label(first).includes('total')) { totalPenalty = num(Object.values(r.cells).slice(-1)[0]); continue; }
      if (!cKpi || r.cells[cKpi] === undefined) continue;
      kpiRows.push({
        no: cNo ? num(r.cells[cNo]) : undefined, channel: cChannel ? r.cells[cChannel] : undefined, kpi: r.cells[cKpi],
        target: num(cTarget ? r.cells[cTarget] : undefined), actual: num(cActual ? r.cells[cActual] : undefined),
        variance: cVariance ? num(r.cells[cVariance]) : undefined, status: (cStatus ? r.cells[cStatus] : '') ?? '',
        penalty: num(cPenalty ? r.cells[cPenalty] : undefined), bracket: cBracket ? r.cells[cBracket] : undefined,
      });
    }
    if (!totalPenalty) totalPenalty = kpiRows.reduce((s, r) => s + r.penalty, 0);
  }

  // Daily performance: a header row with 'date' and 'offered', then one row per day until the dates stop.
  const dailySheet = sheets.map((rows) => ({ rows, hdr: findHeader(rows, (l) => l.some((x) => x === 'date') && l.some((x) => x === 'offered')) })).find((s) => s.hdr);
  const dailyHeaders: string[] = [];
  const dailyRows: TxDailyRow[] = [];
  if (dailySheet?.hdr) {
    const { rows, hdr } = dailySheet;
    const dateCol = hdr.h['date'];
    const cols = Object.entries(rows[hdr.i].cells).filter(([col]) => col !== dateCol).sort(([a], [b]) => a.localeCompare(b));
    for (const [, name] of cols) dailyHeaders.push(name);
    for (const r of rows.slice(hdr.i + 1)) {
      const d = r.cells[dateCol];
      if (!d || !/^\d{4,6}(\.\d+)?$/.test(d)) break;
      const values: Record<string, number> = {};
      cols.forEach(([col, name]) => { values[name] = num(r.cells[col]); });
      dailyRows.push({ date: iso(d), values });
    }
  }

  return {
    fileName: file.name, channel, invoiceNo, issueDate, servicePeriod, periodStart, rate, offered, answered, invoicedTransactions, slaPct,
    abandonmentPct, forecastAccuracyPct, cei, kpiPenaltyPct, forecastAccuracyEffectAmount, totalInvoicedAmount, kpiPenaltyAmount, netInvoiceAmount,
    kpiRows, totalPenalty, dailyHeaders, dailyRows,
  };
}
