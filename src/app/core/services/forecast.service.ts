import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { CURRENT_USER, CrcStore } from './crc-store.service';
import { UiService } from '../../shared/services/ui.service';
import { StatusLevel } from '../models/status';

/**
 * Forecasts (SRS "Forecast Requirements"): the monthly Accrual Forecast for Finance, and the Team Forecast the CRC team
 * prepares and exports for the Budget Team. Data is illustrative and lives in memory, like the rest of the prototype.
 */
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const NOW = new Date();
export const FY_YEAR = NOW.getFullYear();
export const CUR_MONTH = NOW.getMonth();
export const FY_LABEL = 'FY' + FY_YEAR;

export type Comp = 'salary' | 'overtime' | 'performance' | 'other';
export const COMPS: Comp[] = ['salary', 'overtime', 'performance', 'other'];
export const COMP_LABEL: Record<Comp, string> = { salary: 'Salary', overtime: 'Overtime', performance: 'Performance', other: 'Other charges' };
export type Amounts = Record<Comp, number>;

export type AccrualStatus = 'Not Generated' | 'Forecast' | 'Manually Updated' | 'Partially Actualized' | 'Actual' | 'Recalculated' | 'Closed';
export const ACCRUAL_STATUSES: AccrualStatus[] = ['Not Generated', 'Forecast', 'Manually Updated', 'Partially Actualized', 'Actual', 'Recalculated', 'Closed'];
export const ACCRUAL_LEVEL: Record<string, StatusLevel> = { 'Not Generated': 'neutral', 'Not applicable': 'neutral', Forecast: 'info', 'Manually Updated': 'amber', 'Partially Actualized': 'orange', Actual: 'normal', Recalculated: 'info', Closed: 'neutral' };
export const RULES = ['Previous-month actual', 'Previous-month forecast', 'Latest available actual', 'Contractual fixed amount', 'Manual input'] as const;
export type Rule = (typeof RULES)[number];

/** A joiner (from `day`) or leaver (last day `day`) in a month: their salary is only paid for part of the month. */
export interface Movement { month: number; type: 'Joiner' | 'Leaver'; day: number; count: number }

export interface AccrualLine {
  id: string;
  vendor: string;
  vendorCode: string;
  contract: string;
  contractName: string;
  contractType: string;
  contractStatus: 'Active' | 'Expiring Soon';
  category: string;
  startDate: string;
  endDate: string;
  /** Monthly salary per resource, OMR. */
  salary: number;
  hcPlan: number[];
  movements?: Movement[];
  /** Contract baseline used by the "contractual fixed amount" rule and when there is no history yet. */
  base: Amounts;
}

export interface AccrualCell {
  lineId: string;
  month: number;
  hc: number;
  moves: Movement[];
  /** The amount the system or a user forecast; it is kept after the invoice arrives, for audit. */
  forecast: Amounts;
  /** What the system generated, before any manual change. */
  original: Amounts;
  actual: Partial<Amounts>;
  sources: Record<Comp, string>;
  manual: boolean;
  recalculated: boolean;
  closed: boolean;
  invoice?: { ref: string; status: 'Approved' | 'Issued'; issued?: string };
}

export interface Adjustment { id: string; at: string; by: string; lineId: string; month: number; action: 'Manual update' | 'Recalculated' | 'Invoice actualized'; field: string; from: number; to: number; reason: string }

export interface AccrualSettings {
  frequency: 'Monthly' | 'Manual' | 'Monthly with manual confirmation';
  dayRule: 'First day of the month' | 'Specific day of the month' | 'Last working day of the month';
  day: number;
  year: string;
  contractTypes: string[];
  startMonth: number;
  endMonth: number;
  overtimeRule: Rule;
  performanceRule: Rule;
  performanceLabel: string;
  trigger: 'Invoice approved' | 'Invoice issued';
  lockAfter: 'Invoice approval' | 'Invoice issuance' | 'Month-end closure' | 'Finance approval';
  varianceThreshold: number;
  /** AF-009: whether a user may type a new total (the difference goes to other charges). */
  allowTotalOverride: boolean;
  /** The day of the month by which the previous month's period should be closed. */
  closeByDay: number;
}

export interface GenerationRun { id: string; at: string; trigger: 'Scheduled' | 'Manual'; month: string; result: 'Success' | 'Failed'; created: number; note: string }

const plan = (base: number, ...changes: Array<[number, number]>) => {
  let v = base;
  return Array.from({ length: 12 }, (_, m) => { for (const [at, d] of changes) if (at === m) v += d; return v; });
};
const pad = (n: number) => String(n + 1).padStart(2, '0');
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sum = (a: Partial<Amounts>) => COMPS.reduce((s, k) => s + (a[k] ?? 0), 0);

const LINES: AccrualLine[] = [
  { id: 'AL-1', vendor: 'Infoline LLC', vendorCode: 'INF', contract: '2025-013T-00-01', contractName: 'Customer Care Outsourcing 2025', contractType: 'Outsourcing', contractStatus: 'Active', category: 'Bachelor tier (PO1)', startDate: '2025-01-01', endDate: '2027-06-30', salary: 542, hcPlan: plan(4), base: { salary: 0, overtime: 150, performance: 0, other: 0 } },
  { id: 'AL-2', vendor: 'Infoline LLC', vendorCode: 'INF', contract: '2025-013T-00-01', contractName: 'Customer Care Outsourcing 2025', contractType: 'Outsourcing', contractStatus: 'Active', category: 'Diploma tier (PO2)', startDate: '2025-01-01', endDate: '2027-06-30', salary: 470, hcPlan: plan(7, [4, 1]), base: { salary: 0, overtime: 260, performance: 300, other: 100 } },
  { id: 'AL-3', vendor: 'Infoline LLC', vendorCode: 'INF', contract: '2025-013T-00-01', contractName: 'Customer Care Outsourcing 2025', contractType: 'Outsourcing', contractStatus: 'Active', category: 'Non-Diploma tier (PO3 - Outsource)', startDate: '2025-01-01', endDate: '2027-06-30', salary: 404, hcPlan: plan(8, [5, 1], [10, 1]), movements: [{ month: 5, type: 'Joiner', day: 16, count: 1 }], base: { salary: 0, overtime: 350, performance: 500, other: 0 } },
  { id: 'AL-4', vendor: 'Green Umbrella Services', vendorCode: 'GUS', contract: '2025-021T-00-03', contractName: 'Agent Services 2025', contractType: 'Outsourcing', contractStatus: 'Expiring Soon', category: 'Bachelor tier (PO1)', startDate: '2025-03-01', endDate: `${FY_YEAR}-11-30`, salary: 560, hcPlan: plan(5), base: { salary: 0, overtime: 180, performance: 220, other: 0 } },
  { id: 'AL-5', vendor: 'Green Umbrella Services', vendorCode: 'GUS', contract: '2025-021T-00-03', contractName: 'Agent Services 2025', contractType: 'Outsourcing', contractStatus: 'Active', category: 'Diploma tier (PO2)', startDate: '2025-03-01', endDate: `${FY_YEAR + 1}-02-28`, salary: 480, hcPlan: plan(6, [6, -1]), movements: [{ month: 6, type: 'Leaver', day: 20, count: 1 }], base: { salary: 0, overtime: 200, performance: 260, other: 0 } },
];

/** The invoice total includes 5% VAT; the accrual is the cost without it. */
const VAT = 0.05;

const DEFAULT_SETTINGS: AccrualSettings = {
  frequency: 'Monthly', dayRule: 'First day of the month', day: 1, year: FY_LABEL, contractTypes: ['Outsourcing'], startMonth: 0, endMonth: 11,
  overtimeRule: 'Previous-month actual', performanceRule: 'Previous-month actual', performanceLabel: 'Incentive', trigger: 'Invoice approved', lockAfter: 'Month-end closure', varianceThreshold: 10, allowTotalOverride: false, closeByDay: 25,
};

@Injectable({ providedIn: 'root' })
export class AccrualForecast {
  private store = inject(CrcStore);
  private ui = inject(UiService);
  private seq = 0;
  private done = new Set<string>();
  private n = 1;
  private id = (p: string) => p + '-' + ++this.n;

  readonly lines = LINES;
  readonly settings = signal<AccrualSettings>({ ...DEFAULT_SETTINGS });
  readonly cells = signal<AccrualCell[]>([]);
  readonly adjustments = signal<Adjustment[]>([]);
  readonly runs = signal<GenerationRun[]>([
    { id: 'G-1', at: new Date(FY_YEAR, CUR_MONTH, 1, 6, 0).toISOString(), trigger: 'Scheduled', month: MONTH_LONG[CUR_MONTH] + ' ' + FY_YEAR, result: 'Success', created: 5, note: 'Forecast created for the month; current-month overtime and performance taken from last month.' },
  ]);

  constructor() {
    this.cells.set(this.seed());
    const cl = this.closure();
    if (cl) this.store.notify(`Forecast period ${cl.label} is ${cl.days < 0 ? 'past its closing day' : 'approaching closure'}.`, `Close it by day ${this.settings().closeByDay} once its invoices are actualized.`, 'amber', '/contracts-budget/accrual-forecast');
    // AF-013/016: an invoice reaching the configured status replaces the forecast with the actual amount
    effect(() => {
      const runs = this.store.invoiceRuns(), pays = this.store.payments(), trigger = this.settings().trigger;
      untracked(() => {
        for (const run of Object.values(runs)) {
          if (run.status !== 'Approved for payment' || !run.paymentId || this.done.has(run.paymentId)) continue;
          const pay = pays.find((p) => p.id === run.paymentId);
          if (!pay || (trigger === 'Invoice issued' && pay.status === 'Pending')) continue;
          this.done.add(run.paymentId);
          this.actualize(run.vendor, run.period, pay.invoiceAmount / (1 + VAT), pay.invoiceRef ?? pay.id, pay.status === 'Pending' ? 'Approved' : 'Issued');
        }
      });
    });
  }

  // ---------- derived values ----------
  cell = (lineId: string, m: number) => this.cells().find((c) => c.lineId === lineId && c.month === m);
  line = (id: string) => LINES.find((l) => l.id === id)!;
  active = (l: AccrualLine, m: number) => new Date(FY_YEAR, m + 1, 0) >= new Date(l.startDate) && new Date(FY_YEAR, m, 1) <= new Date(l.endDate);

  statusOf(c?: AccrualCell): AccrualStatus {
    if (!c) return 'Not Generated';
    if (c.closed) return 'Closed';
    const n = COMPS.filter((k) => c.actual[k] !== undefined).length;
    if (n === COMPS.length) return 'Actual';
    if (n > 0) return 'Partially Actualized';
    return c.manual ? 'Manually Updated' : c.recalculated ? 'Recalculated' : 'Forecast';
  }

  /** Forecast, actual and variance of one line-month. Variance only covers the components that already have an invoice. */
  totals(c: AccrualCell) {
    const done = COMPS.filter((k) => c.actual[k] !== undefined);
    const forecast = sum(c.forecast);
    const actual = done.reduce((s, k) => s + c.actual[k]!, 0);
    const forecastDone = done.reduce((s, k) => s + c.forecast[k], 0);
    const variance = actual - forecastDone;
    const pct = forecastDone ? (variance / forecastDone) * 100 : 0;
    return { forecast, actual: done.length ? actual : null, variance: done.length ? variance : null, pct, remaining: forecast - forecastDone, expected: actual + forecast - forecastDone, flagged: done.length > 0 && Math.abs(pct) > this.settings().varianceThreshold };
  }
  shown = (c: AccrualCell, k: Comp) => c.actual[k] ?? c.forecast[k];
  shownTotal = (c: AccrualCell) => COMPS.reduce((s, k) => s + this.shown(c, k), 0);
  invoiceState = (c?: AccrualCell) => c?.invoice?.status ?? 'No invoice';

  readonly approved = signal<number[]>([]);
  readonly pending = signal<string | null>(null);

  locked(c: AccrualCell) {
    if (c.closed) return true;
    const l = this.settings().lockAfter;
    if (l === 'Finance approval') return this.approved().includes(c.month);
    return (l === 'Invoice approval' || l === 'Invoice issuance') && COMPS.some((k) => c.actual[k] !== undefined);
  }
  /** AF-009: only the current month's forecast can be adjusted, and only while it is not locked. */
  canEdit = (c?: AccrualCell) => !!c && c.month === CUR_MONTH && !this.locked(c) && COMPS.some((k) => c.actual[k] === undefined);

  nextRun = computed(() => {
    const s = this.settings();
    if (s.frequency === 'Manual') return 'Manual only — no automatic run';
    for (let add = 0; add < 3; add++) {
      const first = new Date(FY_YEAR, CUR_MONTH + add, 1), last = new Date(FY_YEAR, CUR_MONTH + add + 1, 0);
      let d: Date;
      if (s.dayRule === 'First day of the month') d = first;
      else if (s.dayRule === 'Specific day of the month') d = new Date(FY_YEAR, CUR_MONTH + add, Math.min(s.day, last.getDate())); // a month without that day runs on its last day
      else { d = last; while (d.getDay() === 5 || d.getDay() === 6) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1); }
      if (d.getTime() >= new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()).getTime()) return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) + (s.frequency === 'Monthly with manual confirmation' ? ' (waits for confirmation)' : '');
    }
    return '—';
  });

  /** AF-005: head count × salary, where a joiner is paid from their first day and a leaver up to their last day. */
  salaryFor(line: AccrualLine, hc: number, moves: Movement[], m: number) {
    const dim = new Date(FY_YEAR, m + 1, 0).getDate();
    let heads = hc;
    for (const mv of moves) heads += mv.type === 'Joiner' ? -mv.count * (1 - (dim - mv.day + 1) / dim) : mv.count * (mv.day / dim);
    return Math.round(heads * line.salary);
  }

  /** The previous month's period while it is still open and close to (or past) its closing day. */
  readonly closure = computed(() => {
    const m = CUR_MONTH - 1;
    if (m < 0 || this.cells().filter((c) => c.month === m).every((c) => c.closed)) return null;
    const days = this.settings().closeByDay - NOW.getDate();
    return days <= 5 ? { month: m, label: `${MONTH_LONG[m]} ${FY_YEAR}`, days } : null;
  });

  /** What the scheduler does on the generation day, so the behaviour can be tried (there is no real clock job in this prototype). */
  runSchedule(): string {
    const freq = this.settings().frequency, label = `${MONTH_LONG[CUR_MONTH]} ${FY_YEAR}`;
    if (freq === 'Manual') return 'The frequency is Manual, so nothing runs by itself.';
    if (freq === 'Monthly with manual confirmation') {
      this.pending.set(label);
      this.store.log('Forecast Generation Waiting', label, 'The scheduled run is waiting for a manual confirmation.');
      this.store.notify(`Accrual forecast for ${label} is waiting for your confirmation.`, 'Open Accrual Forecast to confirm the generation.', 'amber', '/contracts-budget/accrual-forecast');
      return `The scheduled run is waiting for a confirmation on the Accrual Forecast screen.`;
    }
    const r = this.generate('Scheduled');
    return r.result === 'Success' ? `Scheduled run finished. ${r.note}` : `Scheduled run failed. ${r.note}`;
  }

  confirmPending() {
    if (!this.pending()) return null;
    this.pending.set(null);
    return this.generate('Scheduled');
  }

  // ---------- generation ----------
  private make(line: AccrualLine, m: number, cells: AccrualCell[]): AccrualCell {
    const s = this.settings();
    const hc = line.hcPlan[m];
    const prev = cells.find((c) => c.lineId === line.id && c.month === m - 1);
    const lastActual = (k: Comp) => cells.filter((c) => c.lineId === line.id && c.month < m && c.actual[k] !== undefined).sort((a, b) => b.month - a.month)[0];
    const pick = (k: 'overtime' | 'performance'): [number, string] => {
      const rule = k === 'overtime' ? s.overtimeRule : s.performanceRule;
      const last = lastActual(k);
      if (rule === 'Previous-month actual') {
        if (prev?.actual[k] !== undefined) return [prev.actual[k]!, 'Previous-month actual'];
        if (last) return [last.actual[k]!, 'Latest available actual'];
        if (prev) return [prev.forecast[k], 'Previous-month forecast'];
      } else if (rule === 'Previous-month forecast') { if (prev) return [prev.forecast[k], 'Previous-month forecast']; }
      else if (rule === 'Latest available actual') { if (last) return [last.actual[k]!, 'Latest available actual']; }
      else if (rule === 'Manual input') return [0, 'Manual input'];
      return [line.base[k], 'Contract data'];
    };
    const [ot, otSrc] = pick('overtime'), [perf, perfSrc] = pick('performance');
    const moves = (line.movements ?? []).filter((x) => x.month === m).map((x) => ({ ...x }));
    const amt: Amounts = { salary: this.salaryFor(line, hc, moves, m), overtime: Math.round(ot), performance: Math.round(perf), other: line.base.other };
    return { lineId: line.id, month: m, hc, moves, forecast: { ...amt }, original: { ...amt }, actual: {}, sources: { salary: moves.length ? 'Contract rate × head count, part month for joiners and leavers' : 'Contract rate × expected head count', overtime: otSrc, performance: perfSrc, other: 'Contract data' }, manual: false, recalculated: false, closed: false };
  }

  private seed(): AccrualCell[] {
    const cells: AccrualCell[] = [];
    for (let m = 0; m <= 11; m++) {
      LINES.forEach((line, i) => {
        if (!this.active(line, m)) return;
        const c = this.make(line, m, cells);
        if (m < CUR_MONTH) {
          const f = { overtime: [1.08, 0.94, 1.12, 1][(m + i) % 4], performance: [0.97, 1.05, 1, 0.92][(m + i) % 4] };
          c.actual = { salary: c.forecast.salary, overtime: Math.round(c.forecast.overtime * f.overtime), performance: Math.round(c.forecast.performance * f.performance), other: c.forecast.other };
          c.invoice = { ref: `INV-${line.vendorCode}-${FY_YEAR}${pad(m)}`, status: 'Issued', issued: isoDate(new Date(FY_YEAR, m + 1, 5)) };
          c.closed = m < CUR_MONTH - 1;
        }
        cells.push(c);
      });
    }
    // this month: one line adjusted by a user, one invoiced for salary only
    const cur2 = cells.find((c) => c.lineId === 'AL-2' && c.month === CUR_MONTH);
    if (cur2) { cur2.forecast = { ...cur2.forecast, overtime: cur2.forecast.overtime + 40 }; cur2.manual = true; cur2.sources = { ...cur2.sources, overtime: 'Manual update' }; }
    const cur4 = cells.find((c) => c.lineId === 'AL-4' && c.month === CUR_MONTH);
    if (cur4) { cur4.actual = { salary: cur4.forecast.salary }; cur4.invoice = { ref: `INV-GUS-${FY_YEAR}${pad(CUR_MONTH)}-A`, status: 'Approved' }; }
    this.adjustments.set(cur2 ? [{ id: 'ADJ-1', at: new Date(FY_YEAR, CUR_MONTH, 3, 10, 15).toISOString(), by: 'Noor Al-Rawahi', lineId: 'AL-2', month: CUR_MONTH, action: 'Manual update', field: 'Overtime', from: cur2.original.overtime, to: cur2.forecast.overtime, reason: 'Extra overtime approved for the quarter-end campaign.' }] : []);
    return cells;
  }

  /** AF-001/012: create forecast lines that do not exist yet. Never duplicates a contract line + month. */
  generate(trigger: 'Manual' | 'Scheduled' = 'Manual'): GenerationRun {
    const s = this.settings();
    const bad = LINES.find((l) => s.contractTypes.includes(l.contractType) && l.salary <= 0);
    const label = `${MONTH_LONG[CUR_MONTH]} ${FY_YEAR}`;
    let run: GenerationRun;
    if (bad) {
      run = { id: this.id('G'), at: new Date().toISOString(), trigger, month: label, result: 'Failed', created: 0, note: `${bad.vendor} · ${bad.category} has no salary rate. Nothing was changed.` };
      this.store.log('Forecast Generation Failed', label, run.note, 'Failed');
      this.store.notify('Accrual forecast generation failed.', run.note, 'red', '/contracts-budget/accrual-forecast');
    } else {
      const next = [...this.cells()];
      let created = 0;
      for (let m = s.startMonth; m <= s.endMonth; m++) for (const line of LINES) {
        if (!s.contractTypes.includes(line.contractType) || !this.active(line, m) || next.some((c) => c.lineId === line.id && c.month === m)) continue;
        next.push(this.make(line, m, next)); created++;
      }
      this.cells.set(next);
      run = { id: this.id('G'), at: new Date().toISOString(), trigger, month: label, result: 'Success', created, note: created ? `${created} forecast line(s) created.` : 'Every active contract line already has its forecast — nothing duplicated.' };
      this.store.log('Forecast Generated', label, run.note);
      this.store.notify(`Accrual forecast generated for ${label}.`, run.note, 'green', '/contracts-budget/accrual-forecast');
      this.store.notify('Current-month forecast requires review.', `Check the ${label} lines before Finance uses them.`, 'amber', '/contracts-budget/accrual-forecast');
    }
    this.runs.update((r) => [run, ...r]);
    return run;
  }

  // ---------- manual adjustment ----------
  edit(lineId: string, m: number, v: { hc: number; salary: number; overtime: number; performance: number; other: number; joiners?: number; joinDay?: number; leavers?: number; leaveDay?: number; total?: number }, reason: string): string | null {
    const c = this.cell(lineId, m), line = this.line(lineId);
    if (!c || !this.canEdit(c)) return 'This month cannot be edited. It is locked or is not the current month.';
    const joiners = v.joiners ?? 0, leavers = v.leavers ?? 0, dim = new Date(FY_YEAR, m + 1, 0).getDate();
    if ([v.hc, v.salary, v.overtime, v.performance, v.other, joiners, leavers].some((n) => !isFinite(n) || n < 0)) return 'Amounts, the resource count, joiners and leavers cannot be negative.';
    if (![v.hc, joiners, leavers].every(Number.isInteger)) return 'The resource count, joiners and leavers must be whole numbers.';
    const inMonth = (d?: number) => Number.isInteger(d) && d! >= 1 && d! <= dim;
    if ((joiners > 0 && !inMonth(v.joinDay)) || (leavers > 0 && !inMonth(v.leaveDay))) return `The day of a joiner or leaver must be between 1 and ${dim}.`;
    const moves: Movement[] = [...(joiners > 0 ? [{ month: m, type: 'Joiner' as const, day: v.joinDay!, count: joiners }] : []), ...(leavers > 0 ? [{ month: m, type: 'Leaver' as const, day: v.leaveDay!, count: leavers }] : [])];
    const movesChanged = JSON.stringify(moves) !== JSON.stringify(c.moves);
    const reprice = (v.hc !== c.hc || movesChanged) && v.salary === c.forecast.salary; // a new head count or part-month movement re-prices the salary unless it was typed by hand
    const next: Amounts = { salary: reprice ? this.salaryFor(line, v.hc, moves, m) : v.salary, overtime: v.overtime, performance: v.performance, other: v.other };
    if (v.total !== undefined && Math.round(v.total) !== sum(c.forecast) && Math.round(v.total) !== sum(next)) {
      if (!this.settings().allowTotalOverride) return 'The total can only be typed when Forecast Settings allow it. Change the components instead.';
      next.other += Math.round(v.total) - sum(next); // the difference is booked as other charges
      if (next.other < 0) return 'That total is too low: it would make the other charges negative.';
    }
    const changes: Array<{ field: string; from: number; to: number; comp?: Comp }> = [];
    if (v.hc !== c.hc) changes.push({ field: 'Resource count', from: c.hc, to: v.hc });
    const count = (t: Movement['type'], list: Movement[]) => list.filter((x) => x.type === t).reduce((n, x) => n + x.count, 0);
    for (const t of ['Joiner', 'Leaver'] as const) if (count(t, moves) !== count(t, c.moves)) changes.push({ field: t + 's', from: count(t, c.moves), to: count(t, moves) });
    for (const k of COMPS) if (next[k] !== c.forecast[k]) changes.push({ field: COMP_LABEL[k], from: c.forecast[k], to: next[k], comp: k });
    if (!changes.length) return 'Nothing was changed.';
    if (!reason.trim()) return 'Enter the reason for the adjustment.'; // AF-010
    const at = new Date().toISOString();
    const touched = Object.fromEntries(changes.filter((ch) => ch.comp).map((ch) => [ch.comp!, 'Manual update']));
    this.cells.update((list) => list.map((x) => (x === c ? { ...x, hc: v.hc, moves, forecast: next, manual: true, recalculated: false, sources: { ...x.sources, ...touched } } : x)));
    this.adjustments.update((a) => [...changes.map((ch) => ({ id: this.id('ADJ'), at, by: CURRENT_USER, lineId, month: m, action: 'Manual update' as const, field: ch.field, from: ch.from, to: ch.to, reason: reason.trim() })), ...a]);
    this.store.log('Forecast Updated', `${line.contract} · ${MONTH_LONG[m]}`, changes.map((ch) => `${ch.field}: ${ch.from.toLocaleString()} → ${ch.to.toLocaleString()}`).join('; ') + `. Reason: ${reason.trim()}`);
    this.store.notify('Forecast manually updated.', `${line.vendor} · ${line.category} · ${MONTH_LONG[m]}`, 'amber', '/contracts-budget/accrual-forecast');
    return null;
  }

  /** AF-012: rebuild the current month from the latest source data. The manual values are replaced. */
  recalculate(lineId: string, m: number) {
    const c = this.cell(lineId, m), line = this.line(lineId);
    if (!c || !this.canEdit(c)) return;
    const fresh = this.make(line, m, this.cells().filter((x) => x !== c));
    const at = new Date().toISOString();
    const diffs = COMPS.filter((k) => fresh.forecast[k] !== c.forecast[k]);
    this.cells.update((list) => list.map((x) => (x === c ? { ...x, hc: fresh.hc, moves: fresh.moves, forecast: fresh.forecast, original: fresh.original, sources: fresh.sources, manual: false, recalculated: true } : x)));
    this.adjustments.update((a) => [...diffs.map((k) => ({ id: this.id('ADJ'), at, by: CURRENT_USER, lineId, month: m, action: 'Recalculated' as const, field: COMP_LABEL[k], from: c.forecast[k], to: fresh.forecast[k], reason: 'Recalculated from the latest source data.' })), ...a]);
    this.store.log('Forecast Recalculated', `${line.contract} · ${MONTH_LONG[m]}`, diffs.length ? diffs.map((k) => `${COMP_LABEL[k]}: ${c.forecast[k].toLocaleString()} → ${fresh.forecast[k].toLocaleString()}`).join('; ') : 'No amount changed.');
  }

  /** AF-024 / 1.13: close a month so standard users cannot change it. */
  /** AF-024: Finance signs the month off; with the "Finance approval" rule this locks it and lets it be closed. */
  approvePeriod(m: number): string | null {
    if (m > CUR_MONTH) return 'A future month cannot be approved yet.';
    if (this.approved().includes(m)) return `${MONTH_LONG[m]} is already approved.`;
    this.approved.update((a) => [...a, m]);
    this.store.log('Forecast Period Approved', `${MONTH_LONG[m]} ${FY_YEAR}`, 'Finance approved the period.');
    this.store.notify(`Forecast period approved by Finance: ${MONTH_LONG[m]} ${FY_YEAR}.`, 'It can now be closed.', 'green', '/contracts-budget/accrual-forecast');
    return null;
  }

  closePeriod(m: number): string | null {
    if (this.settings().lockAfter === 'Finance approval' && !this.approved().includes(m)) return 'Finance has to approve this period before it can be closed.';
    this.cells.update((list) => list.map((c) => (c.month === m ? { ...c, closed: true } : c)));
    this.store.log('Forecast Period Closed', `${MONTH_LONG[m]} ${FY_YEAR}`, 'The period is now read-only for standard users.');
    this.store.notify(`Forecast period closed: ${MONTH_LONG[m]} ${FY_YEAR}.`, 'It can no longer be edited.', 'green', '/contracts-budget/accrual-forecast');
    return null;
  }
  openLines = (m: number) => this.cells().filter((c) => c.month === m && !c.closed && COMPS.some((k) => c.actual[k] === undefined)).length;

  saveSettings(next: AccrualSettings) {
    const prev = this.settings();
    const changed = (Object.keys(next) as Array<keyof AccrualSettings>).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(prev[k]));
    if (!changed.length) return false;
    this.settings.set(next);
    this.store.log('Forecast Settings Changed', 'Accrual forecast', changed.map((k) => `${k}: ${JSON.stringify(prev[k])} → ${JSON.stringify(next[k])}`).join('; '));
    return true;
  }

  // ---------- invoice actualization ----------
  private actualize(vendor: string, period: string, amount: number, ref: string, status: 'Approved' | 'Issued') {
    const d = new Date('1 ' + period);
    if (isNaN(+d) || d.getFullYear() !== FY_YEAR) return;
    const m = d.getMonth();
    const targets = this.cells().filter((c) => c.month === m && !c.closed && this.line(c.lineId).vendor === vendor);
    const total = targets.reduce((s, c) => s + sum(c.forecast), 0);
    if (!targets.length || !total) return;
    const at = new Date().toISOString();
    this.cells.update((list) => list.map((c) => {
      if (!targets.includes(c)) return c;
      const k = amount / total;
      return { ...c, actual: Object.fromEntries(COMPS.map((x) => [x, Math.round(c.forecast[x] * k)])) as Amounts, invoice: { ref, status, issued: status === 'Issued' ? isoDate(new Date()) : undefined } };
    }));
    this.adjustments.update((a) => [...targets.map((c) => ({ id: this.id('ADJ'), at, by: 'System', lineId: c.lineId, month: m, action: 'Invoice actualized' as const, field: 'Total', from: sum(c.forecast), to: Math.round(sum(c.forecast) * (amount / total)), reason: `Invoice ${ref} ${status.toLowerCase()}.` })), ...a]);
    const pct = ((amount - total) / total) * 100;
    this.store.log('Invoice Actualized', vendor, `${ref}: ${MONTH_LONG[m]} forecast ${total.toLocaleString()} replaced by the invoice ${amount.toLocaleString()} OMR (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%). The forecast is kept for audit.`);
    this.store.notify(`Invoice approved and forecast actualized: ${vendor}.`, `${MONTH_LONG[m]} ${FY_YEAR} · variance ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, 'green', '/contracts-budget/accrual-forecast');
    if (Math.abs(pct) > this.settings().varianceThreshold) this.store.notify(`Variance exceeds ${this.settings().varianceThreshold}%: ${vendor}.`, `${MONTH_LONG[m]} ${FY_YEAR} actual vs forecast is ${pct.toFixed(1)}%.`, 'red', '/contracts-budget/accrual-forecast');
  }

  // ---------- Excel export (AF-017 – AF-019) ----------
  exportExcel(lines: AccrualLine[], filters: string): string | undefined {
    const stamp = new Date();
    const ref = `ACC-${FY_YEAR}-${isoDate(stamp).replace(/-/g, '')}-${String(++this.seq).padStart(3, '0')}`;
    const hcNow = (l: AccrualLine) => this.cell(l.id, CUR_MONTH)?.hc ?? '';
    const blank = (over: Record<string, any>) => ({ Vendor: '', 'Contract number': '', 'Contract name': '', 'Cost category': '', 'Resource category': '', 'Cost component': '', 'Resource count': '', ...Object.fromEntries(MONTH_SHORT.map((x) => [x, ''])), 'Forecast total': '', 'Actual total': '', Variance: '', 'Invoice references': '', ...over });
    const monthTotals = (cs: AccrualCell[]) => Object.fromEntries(MONTH_SHORT.map((x, i) => [x, cs.filter((c) => c.month === i).reduce((s, c) => s + this.shownTotal(c), 0)]));
    const grand = (cs: AccrualCell[]) => ({ 'Forecast total': cs.reduce((s, c) => s + this.totals(c).forecast, 0), 'Actual total': cs.reduce((s, c) => s + (this.totals(c).actual ?? 0), 0), Variance: cs.reduce((s, c) => s + (this.totals(c).variance ?? 0), 0) });
    const rows: Array<Record<string, any>> = [];
    const detail: Array<Record<string, any>> = [];
    const mine = (ls: AccrualLine[]) => this.cells().filter((c) => ls.some((l) => l.id === c.lineId));
    for (const vendor of [...new Set(lines.map((l) => l.vendor))]) {
      const vLines = lines.filter((l) => l.vendor === vendor);
      for (const contract of [...new Set(vLines.map((l) => l.contract))]) {
        const cLines = vLines.filter((l) => l.contract === contract);
        for (const l of cLines) for (const k of COMPS) {
          const cs = this.cells().filter((c) => c.lineId === l.id);
          const refs = [...new Set(cs.map((c) => c.invoice?.ref).filter(Boolean))].join(', ');
          rows.push(blank({ Vendor: l.vendor, 'Contract number': l.contract, 'Contract name': l.contractName, 'Cost category': 'Outsourcing', 'Resource category': l.category, 'Cost component': COMP_LABEL[k], 'Resource count': hcNow(l), ...Object.fromEntries(MONTH_SHORT.map((x, i) => { const c = cs.find((y) => y.month === i); return [x, c ? this.shown(c, k) : '']; })), 'Forecast total': cs.reduce((s, c) => s + c.forecast[k], 0), 'Actual total': cs.reduce((s, c) => s + (c.actual[k] ?? 0), 0), Variance: cs.reduce((s, c) => s + (c.actual[k] !== undefined ? c.actual[k]! - c.forecast[k] : 0), 0), 'Invoice references': refs }));
          for (const c of cs) detail.push({ Vendor: l.vendor, 'Contract number': l.contract, 'Resource category': l.category, 'Cost component': COMP_LABEL[k], Month: MONTH_LONG[c.month], Forecast: c.forecast[k], Actual: c.actual[k] ?? '', Variance: c.actual[k] !== undefined ? c.actual[k]! - c.forecast[k] : '', Indicator: c.actual[k] !== undefined ? 'Actual' : c.manual ? 'Forecast (manual)' : 'Forecast', 'Invoice reference': c.invoice?.ref ?? '', Status: this.statusOf(c) });
        }
        const cs = mine(cLines);
        rows.push(blank({ Vendor: vendor, 'Contract number': contract, 'Cost component': 'Subtotal — contract', ...monthTotals(cs), ...grand(cs) }));
      }
      const vs = mine(vLines);
      rows.push(blank({ Vendor: vendor, 'Cost component': 'Subtotal — vendor', ...monthTotals(vs), ...grand(vs) }));
    }
    const all = mine(lines);
    rows.push(blank({ 'Cost component': 'GRAND TOTAL (monthly totals)', ...monthTotals(all), ...grand(all) }));
    const file = `Accrual_Forecast_${FY_LABEL}_${ref}`;
    const meta = [
      ['Report', 'Accrual Forecast'], ['Report reference', ref], ['Exported by', CURRENT_USER], ['Export date and time', stamp.toLocaleString('en-GB')], ['Financial year', FY_LABEL],
      ['Forecast period', `${MONTH_LONG[this.settings().startMonth]} – ${MONTH_LONG[this.settings().endMonth]} ${FY_YEAR}`], ['Applied filters', filters || 'None'], ['Amounts', 'OMR. Each month shows the actual invoice amount where there is one, otherwise the forecast.'],
    ].map(([Field, Value]) => ({ Field, Value }));
    const name = this.ui.xlsxSheets(file, [{ name: 'Accrual Forecast', rows }, { name: 'Actual vs Forecast', rows: detail }, { name: 'Export Info', rows: meta }], false);
    if (name) { this.store.log('Forecast Exported', name, `Accrual forecast exported (${rows.length} rows). Filters: ${filters || 'none'}. Reference ${ref}.`); this.ui.toast(`Downloaded ${name}.`); }
    return name;
  }
}

// ======================================================================================================================
// Team Forecast (SRS 2) — expected monthly cost by team and head count, prepared on request for the Budget Team
// ======================================================================================================================
export type TeamComp = 'salary' | 'overtime' | 'performance' | 'incentive';
export const TEAM_COMPS: TeamComp[] = ['salary', 'overtime', 'performance', 'incentive'];
export const TEAM_COMP_LABEL: Record<TeamComp, string> = { salary: 'Salary', overtime: 'Overtime', performance: 'Performance', incentive: 'Incentive' };
export const TEAMS = ['Sales', 'Retention', 'Complaints', 'Debt Recovery', 'Billing Complaints', 'Payment Channels Support'];
export type GroupBy = 'Team' | 'Month' | 'Team and Month' | 'Cost Component';
export const GROUPS: GroupBy[] = ['Team and Month', 'Team', 'Month', 'Cost Component'];

export interface TeamRow { team: string; month: number; hc: number; salary: number; overtime: number; performance: number; incentive: number; status: 'Approved' | 'Draft' }
export interface TeamCriteria { year: string; mode: 'Full financial year' | 'Date range' | 'Selected months'; from: number; to: number; months: number[]; teams: string[]; comps: TeamComp[]; group: GroupBy; status: 'All' | 'Approved' | 'Draft'; sheets: 'One sheet' | 'One sheet per team' }
export interface TeamExport { id: string; at: string; by: string; year: string; months: string; teams: string; comps: string; group: string; file: string; status: 'Generated' | 'Failed'; format: 'Excel' | 'CSV'; emailed: string }
/** A named set of teams that can be picked in one click (TF-003 "team grouping, where configured"). */
export interface TeamGroup { name: string; teams: string[] }

const TEAM_BASE: Record<string, { hc: number; rate: number; ot: number; perf: number; inc: number }> = {
  Sales: { hc: 22, rate: 520, ot: 0.12, perf: 40, inc: 0.05 },
  Retention: { hc: 18, rate: 540, ot: 0.1, perf: 45, inc: 0.06 },
  Complaints: { hc: 25, rate: 500, ot: 0.14, perf: 35, inc: 0.04 },
  'Debt Recovery': { hc: 14, rate: 560, ot: 0.09, perf: 55, inc: 0.08 },
  'Billing Complaints': { hc: 12, rate: 510, ot: 0.11, perf: 38, inc: 0.04 },
  'Payment Channels Support': { hc: 16, rate: 495, ot: 0.08, perf: 30, inc: 0.03 },
};

@Injectable({ providedIn: 'root' })
export class TeamForecast {
  private store = inject(CrcStore);
  private ui = inject(UiService);
  private seq = 0;
  readonly years = [FY_LABEL, 'FY' + (FY_YEAR + 1)];
  readonly exports = signal<TeamExport[]>([]);
  /** SRS 2.9 lists these as questions for the Budget Team (one sheet or one per team, Excel and CSV, email or download). Off until they are confirmed. */
  readonly showUnconfirmed = false;
  readonly groups = signal<TeamGroup[]>([{ name: 'Front line', teams: ['Sales', 'Retention', 'Complaints'] }, { name: 'Back office', teams: ['Debt Recovery', 'Billing Complaints', 'Payment Channels Support'] }]);
  /** Who receives the exported file when the CRC team chooses to email it. */
  readonly recipients = signal('budget.team@omantel.om');
  /** Teams each role may see, from the user's organizational permissions. A role that is not listed sees every team. */
  readonly scope = signal<Record<string, string[]>>({ 'Read-Only User': ['Sales', 'Retention', 'Complaints'] });
  readonly scopeRoles = ['Contract Mgmt Team', 'Contract Mgmt Manager', 'Budget Owner', 'Budget Team', 'Read-Only User'];

  readonly visibleTeams = computed(() => this.scope()[this.store.currentRole()] ?? TEAMS);
  readonly visibleGroups = computed(() => this.groups().map((g) => ({ ...g, teams: g.teams.filter((t) => this.visibleTeams().includes(t)) })).filter((g) => g.teams.length));

  /** The criteria limited to the teams this role may see. */
  private sc(c: TeamCriteria): TeamCriteria { return { ...c, teams: c.teams.filter((t) => this.visibleTeams().includes(t)) }; }

  /** The latest CRC forecast per team and month. Past and current months are approved, later months are still drafts. */
  data(year: string): TeamRow[] {
    const yi = Number(year.slice(2)) - FY_YEAR, grow = Math.pow(1.05, yi);
    const rows: TeamRow[] = [];
    TEAMS.forEach((team, ti) => {
      const b = TEAM_BASE[team];
      for (let m = 0; m < 12; m++) {
        const hc = b.hc + (m >= 5 ? 1 : 0) + (m >= 9 && ti % 2 === 0 ? 1 : 0) + yi * 2;
        const salary = Math.round(hc * b.rate * grow), season = 1 + (m === 3 || m === 11 ? 0.18 : 0);
        rows.push({ team, month: m, hc, salary, overtime: Math.round(salary * b.ot * season), performance: Math.round(hc * b.perf * grow), incentive: Math.round(salary * b.inc), status: yi === 0 && m <= CUR_MONTH ? 'Approved' : 'Draft' });
      }
    });
    return rows;
  }

  months(c: TeamCriteria) { return c.mode === 'Full financial year' ? Array.from({ length: 12 }, (_, i) => i) : c.mode === 'Date range' ? Array.from({ length: Math.max(0, c.to - c.from + 1) }, (_, i) => c.from + i) : [...c.months].sort((a, b) => a - b); }

  /** TF-010: the reasons an export cannot go ahead. */
  problems(c: TeamCriteria): string[] {
    const p: string[] = [];
    if (!this.sc(c).teams.length) p.push(c.teams.length ? 'None of the selected teams is open to your role.' : 'Select at least one team.');
    if (!this.months(c).length) p.push(c.mode === 'Date range' ? 'The end month is before the start month.' : 'Select at least one month or a forecast period.');
    if (!c.comps.length) p.push('Select at least one cost component.');
    if (!p.length && !this.filtered(c).length) p.push('There is no forecast data for the selected filters.');
    return p;
  }

  filtered(c: TeamCriteria): TeamRow[] {
    const months = this.months(c), teams = this.sc(c).teams;
    return this.data(c.year).filter((r) => teams.includes(r.team) && months.includes(r.month) && (c.status === 'All' || r.status === c.status));
  }

  /** Rows exactly as previewed and exported: only the selected components, grouped as chosen. Grouping never changes a value. */
  view(c: TeamCriteria) {
    const rows = this.filtered(c), teams = this.sc(c).teams, comps = TEAM_COMPS.filter((k) => c.comps.includes(k));
    const total = (r: Partial<Record<TeamComp, number>>) => comps.reduce((s, k) => s + (r[k] ?? 0), 0);
    const agg = (rs: TeamRow[]) => Object.fromEntries(comps.map((k) => [k, rs.reduce((s, r) => s + r[k], 0)])) as Record<TeamComp, number>;
    let out: Array<Record<string, any>> = [];
    if (c.group === 'Cost Component') {
      const long = comps.flatMap((k) => rows.map((r) => ({ 'Cost Component': TEAM_COMP_LABEL[k], Team: r.team, Month: MONTH_LONG[r.month], Amount: r[k] })));
      return { columns: ['Cost Component', 'Team', 'Month', 'Amount'], rows: long as Array<Record<string, any>>, comps, total: long.reduce((s, r) => s + r.Amount, 0) };
    }
    if (c.group === 'Team') out = TEAMS.filter((t) => teams.includes(t)).map((t) => { const rs = rows.filter((r) => r.team === t); return { Team: t, Month: `${rs.length} month(s)`, 'Head Count': rs.length ? Math.round(rs.reduce((s, r) => s + r.hc, 0) / rs.length) : 0, ...agg(rs) }; }).filter((r) => r['Head Count'] > 0);
    else if (c.group === 'Month') out = this.months(c).map((m) => { const rs = rows.filter((r) => r.month === m); return { Team: `${new Set(rs.map((r) => r.team)).size} team(s)`, Month: MONTH_LONG[m], 'Head Count': rs.reduce((s, r) => s + r.hc, 0), ...agg(rs) }; }).filter((r) => r['Head Count'] > 0);
    else out = [...rows].sort((a, b) => TEAMS.indexOf(a.team) - TEAMS.indexOf(b.team) || a.month - b.month).map((r) => ({ Team: r.team, Month: MONTH_LONG[r.month], 'Head Count': r.hc, ...Object.fromEntries(comps.map((k) => [k, r[k]])) }));
    const columns = ['Team', 'Month', 'Head Count', ...comps.map((k) => TEAM_COMP_LABEL[k])];
    const named = out.map((r) => ({ Team: r['Team'], Month: r['Month'], 'Head Count': r['Head Count'], ...Object.fromEntries(comps.map((k) => [TEAM_COMP_LABEL[k], r[k]])) }));
    return { columns, rows: named as Array<Record<string, any>>, comps, total: out.reduce((s, r) => s + total(r), 0) };
  }

  /** Totals for the summary sheet (TF-008): per team, per month, per component and overall. HC is not part of any money total. */
  totals(c: TeamCriteria) {
    const rows = this.filtered(c), teams = this.sc(c).teams, comps = TEAM_COMPS.filter((k) => c.comps.includes(k));
    const t = (rs: TeamRow[]) => ({ ...Object.fromEntries(comps.map((k) => [TEAM_COMP_LABEL[k], rs.reduce((s, r) => s + r[k], 0)])), Total: rs.reduce((s, r) => s + comps.reduce((x, k) => x + r[k], 0), 0) });
    return {
      byTeam: TEAMS.filter((x) => teams.includes(x) && rows.some((r) => r.team === x)).map((x) => ({ Team: x, ...t(rows.filter((r) => r.team === x)) })),
      byMonth: this.months(c).filter((m) => rows.some((r) => r.month === m)).map((m) => ({ Month: MONTH_LONG[m], ...t(rows.filter((r) => r.month === m)) })),
      overall: t(rows),
    };
  }

  /** TF-007/008/009: the export, optionally with one worksheet per team, and optionally emailed to the Budget Team. */
  export(criteria: TeamCriteria, format: 'Excel' | 'CSV', email = false): string | undefined {
    const problems = this.problems(criteria);
    if (problems.length) { this.ui.toast(problems[0], 5000); return undefined; }
    const c = this.sc(criteria);
    const stamp = new Date(), ref = `TF-${FY_YEAR}-${isoDate(stamp).replace(/-/g, '')}-${String(++this.seq).padStart(3, '0')}`;
    const v = this.view(c), tot = this.totals(c), months = this.months(c);
    const stem = `Team_Forecast_${c.year}_${ref}`;
    let name: string | undefined;
    if (format === 'CSV') { this.ui.csv(stem + '.csv', v.rows); name = stem + '.csv'; }
    else {
      const meta = [
        ['Report name', 'Team Forecast'], ['Forecast version / reference', ref], ['Financial year', c.year], ['Forecast period', months.length === 12 ? 'Full financial year' : months.map((m) => MONTH_SHORT[m]).join(', ')], ['Selected teams', c.teams.join(', ')],
        ['Selected cost components', c.comps.map((k) => TEAM_COMP_LABEL[k]).join(', ')], ['Grouped by', c.group], ['Worksheets', c.sheets], ['Exported by', CURRENT_USER], ['Export date and time', stamp.toLocaleString('en-GB')], ['Amounts', 'OMR. Head count is not part of any monetary total.'],
      ].map(([Field, Value]) => ({ Field, Value }));
      const summary = [
        ...tot.byTeam.map((r) => ({ Section: 'By team', Name: r.Team, ...pick(r) })), ...tot.byMonth.map((r) => ({ Section: 'By month', Name: r.Month, ...pick(r) })),
        { Section: 'Overall', Name: 'All selected teams and months', ...pick(tot.overall) },
      ];
      const perTeam = c.sheets === 'One sheet per team' ? tot.byTeam.map((r) => ({ name: r.Team, rows: this.view({ ...c, teams: [r.Team] }).rows })) : [];
      name = this.ui.xlsxSheets(stem, [{ name: 'Team Forecast', rows: v.rows }, ...perTeam, { name: 'Totals', rows: summary }, { name: 'Report Info', rows: meta }], false);
    }
    if (!name) return undefined;
    const to = email ? this.recipients().trim() : '';
    this.exports.update((l) => [{ id: ref, at: stamp.toISOString(), by: CURRENT_USER, year: c.year, months: months.length === 12 ? 'Full year' : months.map((m) => MONTH_SHORT[m]).join(', '), teams: c.teams.length === TEAMS.length ? 'All teams' : c.teams.join(', '), comps: c.comps.map((k) => TEAM_COMP_LABEL[k]).join(', '), group: c.group, file: name!, status: 'Generated', format, emailed: to }, ...l]);
    this.store.log('Team Forecast Exported', name, `${c.year} · ${months.length} month(s) · ${c.teams.length} team(s) · ${c.comps.map((k) => TEAM_COMP_LABEL[k]).join('/')} · grouped by ${c.group}. Reference ${ref}.`);
    if (email && !to) this.ui.toast(`Downloaded ${name}. It was not emailed: set the Budget Team recipients in Forecast Settings.`, 6000);
    else if (email) { this.store.log('Team Forecast Emailed', name, `Sent to ${to}.`); this.ui.toast(`Downloaded ${name} and emailed it to ${to}.`, 5000); }
    else this.ui.toast(`Downloaded ${name}. Send it to the Budget Team.`);
    return name;
  }

  // ---------- settings ----------
  saveGroups(next: TeamGroup[]) {
    this.groups.set(next);
    this.store.log('Team Forecast Settings Changed', 'Team groups', next.map((g) => `${g.name}: ${g.teams.join(', ') || 'no teams'}`).join(' | ') || 'No groups.');
  }
  setScope(role: string, teams: string[]) {
    this.scope.update((s) => { const n = { ...s }; if (teams.length === TEAMS.length) delete n[role]; else n[role] = teams; return n; });
    this.store.log('Team Forecast Settings Changed', 'Team access', `${role} can see: ${teams.length === TEAMS.length ? 'all teams' : teams.join(', ') || 'no teams'}.`);
  }
  setRecipients(v: string) {
    this.recipients.set(v);
    this.store.log('Team Forecast Settings Changed', 'Recipients', `Budget Team recipients: ${v || 'none'}.`);
  }
}

const pick = (r: Record<string, any>) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'Team' && k !== 'Month'));
