import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { CURRENT_USER, CrcStore } from './crc-store.service';
import { UiService } from '../../shared/services/ui.service';
import { childRecordsFor, infolineFirst } from './contract-data';
import { Contract } from '../models/domain';

/**
 * The three forecasts CRC keeps for the financial year, as in Omantel's working sheets:
 * - Accrual ("Per Line"): every contract PO line, month by month — actual once invoiced, forecast after.
 * - Team ("Budget Forecasting By Team"): the salary PO split by team — approved budget and head count vs actual/forecast, and the saving.
 * - Transaction ("Actual / Forecast Spending per month"): Voice and Live Chat — transactions and amount, forecast = transactions × unit rate.
 * The three are kept separately, as in the sheets: every accrual line (salary, voice and chat included) has its own yearly forecast.
 * Months before the current one are closed with actuals; the current month and later are forecast. Data lives in memory.
 */
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const NOW = new Date();
export const FY_YEAR = NOW.getFullYear();
export const CUR_MONTH = NOW.getMonth();
export const FY_LABEL = 'FY' + FY_YEAR;
export const MONTHS = MONTH_SHORT.map((_, i) => i);
export const isActual = (m: number) => m < CUR_MONTH;

export type ForecastKind = 'Accrual' | 'Team' | 'Transaction';

export interface ForecastEdit { id: string; at: string; by: string; kind: ForecastKind; item: string; month: number; field: string; from: number | null; to: number | null; reason: string }

// ---------------------------------------------------------------------------------------------------------------------
// Seed data — the figures in Omantel's sheets (FY2026). Months after the sheet's last value repeat it.
// ---------------------------------------------------------------------------------------------------------------------
const INFOLINE_REF = '2025-013T-00-01';
const fill = (vals: number[]) => MONTHS.map((m) => vals[Math.min(m, vals.length - 1)] ?? 0);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

/** "Per Line.xlsx", Infoline lines, Jan–Jun actuals. */
const PER_LINE: Record<string, number[]> = {
  infolinesalary: [83852.975, 90224.614, 86827.289, 87458.479, 88079.25, 90000],
  managesserviceincentive: [5000, 7000, 7000, 7000, 7000, 7000],
  manageserviceincentive: [5000, 7000, 7000, 7000, 7000, 7000],
  performanceallowance: [2800, 2800, 3800, 5200, 5200, 5200],
  overtime: [500, 500, 2441.918, 1500, 1500, 2000],
  csrleavesettlement: [0],
  incentivetelesales: [10055.447, 9868.8, 8488.883, 11951.68, 12600, 12600],
  incentiveebutelesales: [2500, 2500, 2604.96, 2500, 2500, 2500],
  incentiveretentiondevice: [6000, 6000, 6907.013, 6000, 6000, 6200],
  incentivedebtcollection: [3400, 3400, 3400, 3400, 3400, 3400],
  nonvoice: [72431.048, 67579.992, 74415.096, 69897, 69067, 70000],
  voice: [127391.971, 131753.67, 129887.272, 134672, 125331, 134672],
};

export interface TxType { type: string; reportedTo: string; state: string }
export const TX_TYPES: TxType[] = [
  { type: 'Voice', reportedTo: 'Customer Excellence', state: 'Hybrid' },
  { type: 'Live Chat', reportedTo: 'Customer Excellence', state: 'Hybrid' },
];
/** "Actual Forecast Spending per month - Transaction.xlsx": [amount OMR, transactions] per month. */
const TX_SEED: Record<string, Array<[number, number]>> = {
  Voice: [[127391.97, 133690], [131753.67, 113765], [129887.272, 128738], [134871.808, 128523], [140486.283, 131173], [141978.186, 132566], [152643.804, 142524.56], [153481.315, 143306.55], [143181.99, 133690], [138436.282, 129258.9], [134880.198, 125938.56], [131137.096, 122443.6]],
  'Live Chat': [[72431.05, 92997], [67579.99, 77561], [74415.096, 85773], [69897.204, 80259], [66383.1, 73759], [69268.5, 76965], [78877.17, 87641.3], [82239.885, 91377.65], [74945.7, 83273], [83769.48, 93077.2], [80471.232, 89412.48], [81625.14, 90694.6]],
};

export interface Team { name: string; po: string; budget: number[]; approvedHc: number | null; from: number }
export interface TeamMonth { hc: number | null; amount: number | null }
/**
 * "Budget Forecasting By Team.xlsx" (PO 325100185): monthly approved budget and head count, and the head count / amount of every month
 * exactly as in the sheet (Jan–Aug actual, Sep–Dec forecast). The sheet has no Sep–Dec for Revenue; its saving table counts those
 * months as zero saving, so Revenue is forecast at its approved budget.
 */
const x4 = (v: number) => [v, v, v, v];
const TEAM_SEED: Array<{ name: string; budget: number[]; approvedHc: number | null; hc: number[]; amount: number[]; from?: number }> = [
  { name: 'Revenue', budget: fill([58812.909]), approvedHc: 94, hc: [96, 94, 92, 92, 90, 91, 91, 90, ...x4(94)], amount: [57575.148, 56995, 55459.52, 53941.929, 53369.552, 54768.341, 53714.294, 51659.374, ...x4(58812.909)] },
  { name: 'Debt Recovery', budget: fill([5522.259]), approvedHc: 9, hc: [8, 9, 9, 9, 9, 9, 9, 9, ...x4(9)], amount: [5127.381, 4986.502, 5008.895, 5585.26, 5505.26, 4857.685, 5434.507, 5334.507, ...x4(4857.685)] },
  { name: 'Support/Project (RTM) + Technical Team', budget: fill([4295.704]), approvedHc: 5, hc: [5, 5, 5, 5, 5, 6, 9, 11, ...x4(5)], amount: [3726.498, 4835.573, 4453.613, 4452.49, 4618.384, 5097.354, 7393.395, 7915.999, ...x4(5097.354)] },
  { name: 'Complaints', budget: fill([10474.073]), approvedHc: 15, hc: [17, 17, 18, 18, 19, 19, 20, 20, ...x4(18)], amount: [11156.484, 12301.211, 12313.882, 12279.585, 12774.288, 12724.29, 13257.786, 13207.786, ...x4(12133.266)] },
  { name: 'GM Assistant', budget: fill([572.7025]), approvedHc: 1, hc: fill([1]), amount: fill([649.053]) },
  { name: 'Agent Experience', budget: fill([10914.439]), approvedHc: 16, hc: [9, 15, 15, 15, 15, 16, 14, 13, ...x4(16)], amount: [5955.178, 10288.229, 10311.2, 10411.2, 10446.2, 11113.037, 10064.765, 8923.139, ...x4(11113.037)] },
  { name: 'HR', budget: fill([611.024, 611.024, 611.024, 611.024, 611.024, 601.024]), approvedHc: null, hc: fill([1]), amount: fill([611.024, 611.024, 611.024, 611.024, 611.024, 601.024]) },
  { name: 'TRA + Hotline', budget: fill([2725.145]), approvedHc: 4, hc: [3, 4, 5, 5, 5, 4, 4, 4, ...x4(5)], amount: [2098.443, 3286, 3463.008, 3533.008, 3533.008, 2858.144, 2872.082, 2994.795, ...x4(3533.008)] },
  { name: 'New outsourced joined CE', budget: MONTHS.map((m) => (m >= 6 ? 20201.87 : 0)), approvedHc: null, hc: MONTHS.map((m) => (m >= 6 ? 29 : 0)), amount: MONTHS.map((m) => (m >= 6 ? 20201.87 : 0)), from: 6 },
];
const SALARY_PO = '325100185';

// ---------------------------------------------------------------------------------------------------------------------
export interface AccrualRow {
  key: string;
  vendor: string;
  contract: Contract;
  po: string;
  line: string;
}
/** value: what the month shows (actual if invoiced, else forecast); null = outside the contract. awaiting = a past month whose invoice is not approved yet. */
export interface AccrualCell { value: number | null; forecast: number | null; actual: boolean; awaiting: boolean; renewal: boolean; source: string }

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const monthStart = (m: number) => `${FY_YEAR}-${String(m + 1).padStart(2, '0')}-01`;
const monthEnd = (m: number) => new Date(Date.UTC(FY_YEAR, m + 1, 0)).toISOString().slice(0, 10);
const hash = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };

@Injectable({ providedIn: 'root' })
export class ForecastService {
  private store = inject(CrcStore);
  private ui = inject(UiService);
  private seq = 0;
  private id = (p: string) => `${p}-${++this.seq}`;

  readonly edits = signal<ForecastEdit[]>([]);

  // ================= Transaction =================
  readonly txRates = signal<Record<string, number>>({ Voice: 1.071, 'Live Chat': 0.9 });
  readonly txBudget = signal(2623730.632);
  /** Actual months hold the invoiced amount and transactions; forecast months hold the expected transactions only. */
  readonly txMonths = signal<Record<string, Array<{ amount: number; tx: number }>>>(
    Object.fromEntries(TX_TYPES.map((t) => [t.type, TX_SEED[t.type].map(([amount, tx]) => ({ amount, tx }))])),
  );
  txAmount = (type: string, m: number) => { const c = this.txMonths()[type][m]; return isActual(m) ? c.amount : r3(c.tx * (this.txRates()[type] ?? 0)); };
  txCount = (type: string, m: number) => this.txMonths()[type][m].tx;
  readonly txSummary = computed(() => {
    const types = TX_TYPES.map((t) => t.type);
    const actual = types.reduce((s, t) => s + MONTHS.filter(isActual).reduce((x, m) => x + this.txAmount(t, m), 0), 0);
    const forecast = types.reduce((s, t) => s + MONTHS.filter((m) => !isActual(m)).reduce((x, m) => x + this.txAmount(t, m), 0), 0);
    const tx = types.reduce((s, t) => s + MONTHS.reduce((x, m) => x + this.txCount(t, m), 0), 0);
    const budget = this.txBudget(), total = actual + forecast;
    return { budget, actual, forecast, total, tx, saving: budget - total, pct: budget ? ((budget - total) / budget) * 100 : 0 };
  });

  setTransactions(type: string, m: number, tx: number, reason: string): string | null {
    if (isActual(m)) return `${MONTH_LONG[m]} is closed with its actual figures.`;
    if (!isFinite(tx) || tx < 0) return 'Transactions cannot be negative.';
    if (!reason.trim()) return 'Enter the reason for the change.';
    const from = this.txCount(type, m);
    if (from === tx) return 'Nothing was changed.';
    this.txMonths.update((all) => ({ ...all, [type]: all[type].map((c, i) => (i === m ? { ...c, tx } : c)) }));
    this.record('Transaction', type, m, 'Transactions', from, tx, reason);
    return null;
  }

  // ================= Team =================
  readonly teams = signal<Team[]>(TEAM_SEED.map((t) => ({ name: t.name, po: SALARY_PO, budget: t.budget, approvedHc: t.approvedHc, from: t.from ?? 0 })));
  /** Actual months are the seed; forecast months start empty (null) and fall back to the last actual head count × its cost per head. */
  readonly teamMonths = signal<Record<string, TeamMonth[]>>(
    Object.fromEntries(TEAM_SEED.map((t) => [t.name, MONTHS.map((m) => ({ hc: t.hc[m] ?? 0, amount: t.amount[m] ?? 0 }))])),
  );
  private lastActual(team: string) {
    const ms = this.teamMonths()[team] ?? [];
    for (let m = CUR_MONTH - 1; m >= 0; m--) if (ms[m]?.hc) return { hc: ms[m].hc!, perHead: (ms[m].amount ?? 0) / ms[m].hc! };
    return { hc: 0, perHead: 0 };
  }
  private started = (team: string, m: number) => m >= (this.teams().find((t) => t.name === team)?.from ?? 0);
  teamHc = (team: string, m: number) => (!this.started(team, m) ? 0 : this.teamMonths()[team]?.[m]?.hc ?? (isActual(m) ? 0 : this.lastActual(team).hc));
  teamAmount = (team: string, m: number) => {
    if (!this.started(team, m)) return 0;
    const c = this.teamMonths()[team]?.[m];
    if (c?.amount != null) return c.amount;
    if (isActual(m)) return 0;
    const la = this.lastActual(team);
    return r3(this.teamHc(team, m) * la.perHead);
  };
  readonly teamChanged = signal<Set<string>>(new Set());
  teamManual = (team: string, m: number) => this.teamChanged().has(team + '|' + m);
  teamMonthTotal = (m: number) => this.teams().reduce((s, t) => s + this.teamAmount(t.name, m), 0);
  readonly teamSummary = computed(() => {
    const ts = this.teams();
    const budget = ts.reduce((s, t) => s + t.budget.reduce((a, b) => a + b, 0), 0);
    const actual = ts.reduce((s, t) => s + MONTHS.filter(isActual).reduce((x, m) => x + this.teamAmount(t.name, m), 0), 0);
    const forecast = ts.reduce((s, t) => s + MONTHS.filter((m) => !isActual(m)).reduce((x, m) => x + this.teamAmount(t.name, m), 0), 0);
    const total = actual + forecast;
    return { budget, actual, forecast, total, saving: budget - total, pct: budget ? ((budget - total) / budget) * 100 : 0, hc: ts.reduce((s, t) => s + this.teamHc(t.name, CUR_MONTH), 0), approvedHc: ts.reduce((s, t) => s + (t.approvedHc ?? 0), 0) };
  });

  /** A forecast month of one team: a new head count re-prices the amount at the team's cost per head unless an amount is typed. */
  setTeamMonth(team: string, m: number, hc: number, amount: number | null, reason: string): string | null {
    if (isActual(m)) return `${MONTH_LONG[m]} is closed with its actual figures.`;
    if (!this.started(team, m)) return `${team} only starts in ${MONTH_LONG[this.teams().find((t) => t.name === team)!.from]}.`;
    if (!Number.isInteger(hc) || hc < 0) return 'The head count must be a whole number, 0 or more.';
    if (amount !== null && (!isFinite(amount) || amount < 0)) return 'The amount cannot be negative.';
    if (!reason.trim()) return 'Enter the reason for the change.';
    const fromHc = this.teamHc(team, m), fromAmt = this.teamAmount(team, m);
    const nextAmt = amount ?? r3(hc * this.lastActual(team).perHead);
    if (fromHc === hc && fromAmt === nextAmt) return 'Nothing was changed.';
    this.teamMonths.update((all) => ({ ...all, [team]: all[team].map((c, i) => (i === m ? { hc, amount: nextAmt } : c)) }));
    this.teamChanged.update((set) => new Set(set).add(team + '|' + m));
    if (fromHc !== hc) this.record('Team', team, m, 'Head count', fromHc, hc, reason);
    if (fromAmt !== nextAmt) this.record('Team', team, m, 'Amount', fromAmt, nextAmt, reason);
    return null;
  }

  /** A team that joins during the year (like "New outsourced joined CE"): budget, head count and cost from its first month. */
  addTeam(v: { name: string; from: number; budget: number; approvedHc: number | null; hc: number; amount: number }): string | null {
    const name = v.name.trim();
    if (!name) return 'Enter the team name.';
    if (this.teams().some((t) => norm(t.name) === norm(name))) return 'A team with this name already exists.';
    if (v.from < CUR_MONTH) return 'A new team can only start in the current month or later.';
    this.teams.update((l) => [...l, { name, po: SALARY_PO, budget: MONTHS.map((m) => (m >= v.from ? v.budget : 0)), approvedHc: v.approvedHc, from: v.from }]);
    this.teamMonths.update((all) => ({ ...all, [name]: MONTHS.map((m) => (m >= v.from ? { hc: v.hc, amount: v.amount } : { hc: 0, amount: 0 })) }));
    this.store.log('Team Added to Forecast', name, `From ${MONTH_LONG[v.from]}: ${v.hc} head count, ${v.amount.toLocaleString('en-GB')} OMR a month, approved budget ${v.budget.toLocaleString('en-GB')} OMR a month.`);
    return null;
  }

  saveTeamBudgets(next: Array<{ name: string; budget: number; approvedHc: number | null }>) {
    const changes: string[] = [];
    this.teams.update((l) => l.map((t) => {
      const n = next.find((x) => x.name === t.name);
      if (!n) return t;
      const monthly = t.budget.find((b) => b > 0) ?? 0;
      if (n.budget === monthly && n.approvedHc === t.approvedHc) return t;
      changes.push(`${t.name}: ${monthly.toLocaleString('en-GB')} → ${n.budget.toLocaleString('en-GB')} OMR/month, head count ${t.approvedHc ?? '—'} → ${n.approvedHc ?? '—'}`);
      return { ...t, budget: t.budget.map((_, m) => (m >= t.from ? n.budget : 0)), approvedHc: n.approvedHc };
    }));
    if (changes.length) this.store.log('Forecast Settings Changed', 'Team approved budgets', changes.join('; '));
    return changes.length;
  }

  // ================= Accrual =================
  /** Every PO line of every contract running in the financial year. */
  readonly accrualRows = computed<AccrualRow[]>(() => {
    const fyStart = monthStart(0), fyEnd = monthEnd(11);
    return this.store.contracts()
      .filter((c) => c.status !== 'Cancelled' && c.startDate <= fyEnd && (c.endDate >= fyStart || c.renewalStatus === 'Renewal in progress'))
      .sort((a, b) => infolineFirst(a.vendorName, b.vendorName) || a.reference.localeCompare(b.reference))
      .flatMap((c) => childRecordsFor(c).filter((k) => k.recordType === 'Variation Order').map((k, i) => ({ key: `${c.reference}|L${i + 1}`, vendor: c.vendorName, contract: c, po: c.poNumber ?? '', line: k.description })));
  });

  /** Actual amounts: the invoices approved so far (seeded history) plus every line approved for payment in Reconciliation. */
  readonly actuals = signal<Record<string, Record<number, number>>>({});
  /** The yearly forecast: entered once a year per line and month (null = not entered). */
  readonly plan = signal<Record<string, Array<number | null>>>({});

  constructor() {
    const rows = this.accrualRows();
    this.actuals.set(this.seedActuals(rows));
    this.plan.set(this.seedPlan(rows));
    // An approved line in Reconciliation replaces that month's forecast with the invoiced amount; the forecast is kept for comparison.
    effect(() => {
      const runs = this.store.invoiceRuns();
      untracked(() => {
        for (const run of Object.values(runs).flat()) {
          if (run.status !== 'Approved for payment') continue;
          const d = new Date('1 ' + run.period), l = run.lines[0];
          if (isNaN(+d) || d.getFullYear() !== FY_YEAR || !l) continue;
          const m = d.getMonth();
          if (this.actuals()[l.key]?.[m] === l.vendorAmount) continue;
          this.actuals.update((a) => ({ ...a, [l.key]: { ...(a[l.key] ?? {}), [m]: l.vendorAmount } }));
          this.store.log('Accrual Actualized', `${l.key.split('|')[0]} · ${l.label}`, `${MONTH_LONG[m]} forecast replaced by the approved invoice amount ${l.vendorAmount.toLocaleString('en-GB')} OMR.`);
        }
      });
    });
  }

  inPeriod = (c: Contract, m: number) => c.startDate <= monthEnd(m) && c.endDate >= monthStart(m);
  private renewal = (c: Contract, m: number) => !this.inPeriod(c, m) && c.renewalStatus === 'Renewal in progress' && c.startDate <= monthEnd(m);
  private open = (r: AccrualRow, m: number) => this.inPeriod(r.contract, m) || this.renewal(r.contract, m);
  private monthlyShare(r: AccrualRow) {
    const c = r.contract, months = Math.max(1, Math.round((new Date(c.endDate).getTime() - new Date(c.startDate).getTime()) / 2629800000));
    const lines = this.accrualRows().filter((x) => x.contract.reference === c.reference).length || 1;
    return r3(c.amount / months / lines);
  }
  private sheetBase(r: AccrualRow, m: number) {
    const sheet = r.contract.reference === INFOLINE_REF ? PER_LINE[norm(r.line)] : undefined;
    return sheet ? fill(sheet)[m] : r.contract.reference === INFOLINE_REF ? 0 : this.monthlyShare(r);
  }

  private seedActuals(rows: AccrualRow[]) {
    const out: Record<string, Record<number, number>> = {};
    for (const r of rows) {
      const hist: Record<number, number> = {};
      for (const m of MONTHS.filter(isActual)) {
        if (!this.open(r, m)) continue;
        hist[m] = r.contract.reference === INFOLINE_REF ? this.sheetBase(r, m) : r3(this.sheetBase(r, m) * (0.94 + (hash(r.key + m) % 13) / 100));
      }
      out[r.key] = hist;
    }
    return out;
  }

  /** The forecast the team entered at the start of the year: a figure per month, rounded like a hand-made plan. */
  private seedPlan(rows: AccrualRow[]) {
    const out: Record<string, Array<number | null>> = {};
    for (const r of rows) {
      out[r.key] = MONTHS.map((m) => {
        if (!this.open(r, m)) return null;
        const base = this.sheetBase(r, m), step = base >= 1000 ? 100 : 10;
        return Math.round((base * (0.95 + (hash(r.key + 'p' + m) % 11) / 100)) / step) * step;
      });
    }
    return out;
  }

  forecastOf(r: AccrualRow, m: number): number | null {
    return this.plan()[r.key]?.[m] ?? null;
  }

  /** What one line shows in one month: the approved invoice amount once there is one, otherwise the forecast. */
  cell(r: AccrualRow, m: number): AccrualCell {
    if (!this.open(r, m)) return { value: null, forecast: null, actual: false, awaiting: false, renewal: false, source: 'Outside the contract period' };
    const renewal = this.renewal(r.contract, m), forecast = this.forecastOf(r, m), act = this.actuals()[r.key]?.[m];
    const f = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 3 });
    if (act !== undefined) return { value: act, forecast, actual: true, awaiting: false, renewal, source: `Actual — approved invoice ${f(act)} OMR` + (forecast !== null ? ` · forecast was ${f(forecast)} (${act - forecast >= 0 ? '+' : ''}${f(r3(act - forecast))})` : '') };
    const awaiting = m < CUR_MONTH;
    return { value: forecast ?? 0, forecast, actual: false, awaiting, renewal, source: (forecast === null ? 'No forecast entered' : 'Yearly forecast') + (awaiting ? ' · invoice not approved yet' : '') };
  }

  /** Saves the yearly forecast typed on the Accrual screen. Months with an approved invoice are skipped. */
  setPlan(changes: Array<{ r: AccrualRow; m: number; value: number }>, note: string): string | null {
    const ok = changes.filter(({ r, m }) => this.open(r, m) && this.actuals()[r.key]?.[m] === undefined);
    if (ok.some((c) => !isFinite(c.value) || c.value < 0)) return 'Amounts cannot be negative.';
    const real = ok.filter((c) => (this.plan()[c.r.key]?.[c.m] ?? null) !== c.value);
    if (!real.length) return 'Nothing was changed.';
    if (!note.trim()) return 'Enter a note for this forecast (for example "FY forecast" or the reason for the change).';
    const before = real.map((c) => this.plan()[c.r.key]?.[c.m] ?? null);
    this.plan.update((p) => {
      const n = { ...p };
      for (const c of real) { n[c.r.key] = [...(n[c.r.key] ?? MONTHS.map(() => null))]; n[c.r.key][c.m] = c.value; }
      return n;
    });
    real.forEach((c, i) => this.record('Accrual', `${c.r.contract.reference} · ${c.r.line}`, c.m, 'Forecast', before[i], c.value, note, false));
    const lines = new Set(real.map((c) => c.r.key)).size;
    this.store.log('Accrual Forecast Updated', `${lines} line(s)`, `${real.length} month figure(s) changed. Note: ${note.trim()}`);
    return null;
  }

  setTxSettings(budget: number, rates: Record<string, number>) {
    const changes = [budget !== this.txBudget() && `Approved budget ${this.txBudget().toLocaleString('en-GB')} → ${budget.toLocaleString('en-GB')} OMR`, ...Object.keys(rates).filter((k) => rates[k] !== this.txRates()[k]).map((k) => `${k} rate ${this.txRates()[k]} → ${rates[k]} OMR`)].filter(Boolean);
    if (!changes.length) return 0;
    this.txBudget.set(budget);
    this.txRates.set({ ...rates });
    this.store.log('Forecast Settings Changed', 'Transaction forecast', changes.join('; '));
    return changes.length;
  }

  private record(kind: ForecastKind, item: string, month: number, field: string, from: number | null, to: number | null, reason: string, log = true) {
    const e: ForecastEdit = { id: this.id('FE'), at: new Date().toISOString(), by: CURRENT_USER, kind, item, month, field, from, to, reason: reason.trim() };
    this.edits.update((l) => [e, ...l]);
    const f = (n: number | null) => (n === null ? '—' : n.toLocaleString('en-GB', { maximumFractionDigits: 3 }));
    if (log) this.store.log(`${kind} Forecast Updated`, `${item} · ${MONTH_LONG[month]}`, `${field}: ${f(from)} → ${f(to)}. Reason: ${e.reason}`);
  }

  // ================= Excel exports (same layout as the sheets) =================
  exportAccrual(rows: AccrualRow[]) {
    const money = (n: number | null) => (n === null ? '' : r3(n));
    const head = (r: AccrualRow) => ({ Vendor: r.vendor, Contract: r.contract.reference, 'Contract type': r.contract.contractType, 'Scope of work': r.line, 'PO no.': r.po, From: r.contract.startDate, To: r.contract.endDate, 'Contract value': r.contract.amount });
    const out = rows.map((r) => {
      const cells = MONTHS.map((m) => this.cell(r, m));
      const actual = cells.filter((c) => c.actual).reduce((s, c) => s + (c.value ?? 0), 0), remaining = cells.filter((c) => !c.actual).reduce((s, c) => s + (c.value ?? 0), 0);
      return { ...head(r), ...Object.fromEntries(MONTHS.map((m) => [`${MONTH_SHORT[m]} ${FY_YEAR}${cells[m].actual ? '' : ' (F)'}`, money(cells[m].value)])), 'Yearly forecast': r3(cells.reduce((s, c) => s + (c.forecast ?? 0), 0)), 'Actual (approved)': r3(actual), 'Expected year total': r3(actual + remaining) };
    });
    const plan = rows.map((r) => ({ ...head(r), ...Object.fromEntries(MONTHS.map((m) => [`${MONTH_SHORT[m]} ${FY_YEAR}`, money(this.cell(r, m).forecast)])) }));
    return this.save('Accrual_Forecast', 'Accrual Forecast', out, 'Each month shows the approved invoice amount, or the forecast (F) until the invoice is approved. The Yearly Forecast sheet keeps the forecast of every month.', [{ name: 'Yearly Forecast', rows: plan }]);
  }

  exportTeam() {
    const out = this.teams().flatMap((t) => MONTHS.map((m) => ({
      PO: t.po, Team: t.name, Month: `${MONTH_SHORT[m]} ${FY_YEAR}`, Type: isActual(m) ? 'Actual' : 'Forecast', 'Approved budget': t.budget[m], 'Approved head count': t.approvedHc ?? '', 'Head count': this.teamHc(t.name, m), Amount: r3(this.teamAmount(t.name, m)), Saving: r3(t.budget[m] - this.teamAmount(t.name, m)),
    })));
    const s = this.teamSummary();
    return this.save('Team_Forecast', 'Team Forecast', out, `Approved budget ${r3(s.budget)} · Accrual ${r3(s.actual)} · Forecast ${r3(s.forecast)} · Total ${r3(s.total)} · Saving ${r3(s.saving)} (${s.pct.toFixed(2)}%) OMR.`);
  }

  exportTransactions() {
    const out = TX_TYPES.map((t) => ({
      'Reported to': t.reportedTo, 'Contract state': t.state, Type: t.type,
      ...Object.fromEntries(MONTHS.flatMap((m) => [[`${MONTH_SHORT[m]} amount${isActual(m) ? '' : ' (F)'}`, r3(this.txAmount(t.type, m))], [`${MONTH_SHORT[m]} transactions`, this.txCount(t.type, m)]])),
      'Total amount': r3(MONTHS.reduce((s, m) => s + this.txAmount(t.type, m), 0)), 'Total transactions': r3(MONTHS.reduce((s, m) => s + this.txCount(t.type, m), 0)),
    }));
    const s = this.txSummary();
    return this.save('Transaction_Forecast', 'Transaction Forecast', out, `Forecast amount = transactions × unit rate (${TX_TYPES.map((t) => `${t.type} ${this.txRates()[t.type]} OMR`).join(', ')}). Approved budget ${r3(s.budget)} · Total ${r3(s.total)} · Saving ${r3(s.saving)} (${s.pct.toFixed(2)}%) OMR.`);
  }

  private save(stem: string, title: string, rows: Array<Record<string, any>>, note: string, extra: Array<{ name: string; rows: Array<Record<string, any>> }> = []) {
    const stamp = new Date();
    const meta = [['Report', title], ['Financial year', FY_LABEL], ['Actual months', CUR_MONTH ? `January – ${MONTH_LONG[CUR_MONTH - 1]}` : 'None yet'], ['Forecast months', `${MONTH_LONG[CUR_MONTH]} – December`], ['Notes', note], ['Exported by', CURRENT_USER], ['Export date and time', stamp.toLocaleString('en-GB')]].map(([Field, Value]) => ({ Field, Value }));
    const name = this.ui.xlsxSheets(`${stem}_${FY_LABEL}`, [{ name: title, rows }, ...extra, { name: 'Report Info', rows: meta }], false);
    if (name) { this.store.log('Forecast Exported', name, `${title} exported (${rows.length} rows).`); this.ui.toast(`Downloaded ${name}.`); }
    return name;
  }
}
