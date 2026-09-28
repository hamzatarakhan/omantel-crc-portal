import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { CURRENT_USER, CrcStore } from './crc-store.service';
import { UiService, XCell, XSheet } from '../../shared/services/ui.service';
import { addDays, addMonths, childRecordsFor, infolineFirst, minIso, yearlyBudgetFor } from './contract-data';
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

/** month: a calendar-FY index (Team/Transaction) or an ISO month-start date (Accrual — its lines run on their own contract-year, not the FY). */
export interface ForecastEdit { id: string; at: string; by: string; kind: ForecastKind; item: string; month: number | string; field: string; from: number | null; to: number | null; reason: string }

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

export interface Team { name: string; po: string; approvedHc: number | null }
export interface TeamMonth { hc: number; amount: number; budget: number }
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
  /** Shared with the Reconciliation/payable-line key (`ref|L<n>`) so an approved invoice actualizes the right line. */
  key: string;
  /** Unique per contract-year line, for template `track` (two contract-years can share the same `key`). */
  id: string;
  vendor: string;
  contract: Contract;
  po: string;
  year: number;
  yearLabel: string;
  yearFrom: string;
  yearTo: string;
  lineNo: number;
  line: string;
  scope: string;
  /** The Yearly Budget line's approved amount (CRC override if set, else the ERP-estimated allocation). */
  budget: number;
}
/** value: what the month shows (actual if invoiced, else forecast). awaiting = a past month whose invoice is not approved yet. */
export interface AccrualCell { value: number | null; forecast: number | null; actual: boolean; awaiting: boolean; source: string }

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const hash = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };
/** The ISO start-of-month date containing today, for splitting a line's real months into actual (past) vs. forecast. */
const todayMonthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10); };

@Injectable({ providedIn: 'root' })
export class ForecastService {
  private store = inject(CrcStore);
  private ui = inject(UiService);
  private seq = 0;
  private id = (p: string) => `${p}-${++this.seq}`;

  readonly edits = signal<ForecastEdit[]>([]);

  // ================= Transaction =================
  /** Approved budget and per-transaction rates belong to a contract (the salary PO's is the only one seeded today). */
  readonly txSettings = signal<Record<string, { budget: number; rates: Record<string, number> }>>({});
  txBudgetOf = (contractRef: string) => this.txSettings()[contractRef]?.budget ?? 0;
  txRatesOf = (contractRef: string) => this.txSettings()[contractRef]?.rates ?? Object.fromEntries(TX_TYPES.map((t) => [t.type, 0]));
  /** Actual months hold the invoiced amount and transactions; forecast months hold the expected transactions only. Keyed by type, then the real ISO month-start date. */
  readonly txMonths = signal<Record<string, Record<string, { amount: number; tx: number }>>>({});
  txAmount = (type: string, monthIso: string, contractRef: string) => { const c = this.txMonths()[type]?.[monthIso]; if (!c) return 0; return this.isClosedMonth(monthIso) ? c.amount : r3(c.tx * (this.txRatesOf(contractRef)[type] ?? 0)); };
  txCount = (type: string, monthIso: string) => this.txMonths()[type]?.[monthIso]?.tx ?? 0;

  private seedTxSettings(): Record<string, { budget: number; rates: Record<string, number> }> {
    const c = this.teamContract();
    return c ? { [c.reference]: { budget: 2623730.632, rates: { Voice: 1.071, 'Live Chat': 0.9 } } } : {};
  }

  private seedTxMonths(): Record<string, Record<string, { amount: number; tx: number }>> {
    const years = this.teamYears();
    const out: Record<string, Record<string, { amount: number; tx: number }>> = {};
    for (const t of TX_TYPES) {
      const hist: Record<string, { amount: number; tx: number }> = {};
      for (const y of years) {
        this.monthsBetween(y.from, y.to).forEach((m, i) => {
          const seed = TX_SEED[t.type][Math.min(i, TX_SEED[t.type].length - 1)];
          hist[m] = { amount: seed[0], tx: seed[1] };
        });
      }
      out[t.type] = hist;
    }
    return out;
  }

  setTransactions(type: string, monthIso: string, tx: number, reason: string): string | null {
    if (this.isClosedMonth(monthIso)) return `${this.monthLabel(monthIso)} is closed with its actual figures.`;
    if (!isFinite(tx) || tx < 0) return 'Transactions cannot be negative.';
    if (!reason.trim()) return 'Enter the reason for the change.';
    const from = this.txCount(type, monthIso);
    if (from === tx) return 'Nothing was changed.';
    this.txMonths.update((all) => ({ ...all, [type]: { ...(all[type] ?? {}), [monthIso]: { ...(all[type]?.[monthIso] ?? { amount: 0, tx: 0 }), tx } } }));
    this.record('Transaction', type, monthIso, 'Transactions', from, tx, reason);
    return null;
  }

  // ================= Team =================
  readonly teams = signal<Team[]>(TEAM_SEED.map((t) => ({ name: t.name, po: SALARY_PO, approvedHc: t.approvedHc })));
  /** hc/amount/budget per team, keyed by the real ISO month-start date; a missing month means the team hasn't joined yet. */
  readonly teamMonths = signal<Record<string, Record<string, TeamMonth>>>({});
  readonly teamChanged = signal<Set<string>>(new Set());

  /**
   * The rows above ("Revenue", "Complaints", ...) are GROUPS of teams; the teams themselves are the agents' queues (RTM, Project, Hotline, ...).
   * This says which group each team belongs to — set on the Group of Teams screen. A team with no entry has no group yet.
   * The starting links are the obvious ones by name; the rest are left for the user to place.
   */
  readonly teamGroup = signal<Record<string, string>>({
    Complaints: 'Complaints', 'Agent Experience': 'Agent Experience', 'Debt Recovery': 'Debt Recovery',
    RTM: 'Support/Project (RTM) + Technical Team', Project: 'Support/Project (RTM) + Technical Team',
    Hotline: 'TRA + Hotline', 'TRA Complaint': 'TRA + Hotline',
  });
  /** Groups created on the Group of Teams screen (they start with no forecast figures, so they can be deleted while empty). */
  private readonly customGroups = signal<Set<string>>(new Set());
  /** Every team (queue) the workforce has — the pool the Group of Teams screen links from. */
  readonly allTeams = computed(() => [...new Set([...this.store.agents().map((a) => a.queue), ...Object.keys(this.teamGroup())])].sort((a, b) => a.localeCompare(b)));
  teamsOf = (group: string) => this.allTeams().filter((t) => this.teamGroup()[t] === group);
  agentsIn = (team: string) => this.store.agents().filter((a) => a.queue === team).length;
  canRemoveGroup = (group: string) => this.customGroups().has(group) && !this.teamsOf(group).length;

  setTeamGroup(team: string, group: string | null) {
    const from = this.teamGroup()[team] ?? null;
    if (from === group) return;
    this.teamGroup.update((m) => { const n = { ...m }; if (group) n[team] = group; else delete n[team]; return n; });
    this.store.log('Group of Teams Changed', team, group ? (from ? `Moved from "${from}" to "${group}".` : `Linked to "${group}".`) : `Unlinked from "${from}".`);
  }
  addGroup(name: string): string | null {
    const n = name.trim();
    if (!n) return 'Enter a name for the group.';
    if (this.teams().some((t) => t.name.toLowerCase() === n.toLowerCase())) return `A group called "${n}" already exists.`;
    this.teams.update((l) => [...l, { name: n, po: SALARY_PO, approvedHc: null }]);
    this.teamMonths.update((all) => ({ ...all, [n]: {} }));
    this.customGroups.update((s) => new Set(s).add(n));
    this.store.log('Group of Teams Created', n, 'New group. Its approved budget is set in Forecast Settings.');
    return null;
  }
  removeGroup(name: string): string | null {
    if (!this.canRemoveGroup(name)) return 'Only a group you created, with no teams in it, can be deleted.';
    this.teams.update((l) => l.filter((t) => t.name !== name));
    this.teamMonths.update((all) => { const { [name]: _gone, ...rest } = all; return rest; });
    this.customGroups.update((s) => { const n = new Set(s); n.delete(name); return n; });
    this.store.log('Group of Teams Deleted', name, 'The empty group was deleted.');
    return null;
  }

  /** Contracts backing Team Forecast (currently just the salary PO's), for the vendor/contract/type filters. */
  teamContracts(): Contract[] {
    return this.store.contracts().filter((c) => c.poNumber === SALARY_PO);
  }
  /** The salary contract (PO 325100185) — the default/only one Team Forecast is tracked against. */
  teamContract(): Contract | undefined {
    return this.teamContracts()[0];
  }
  /** Any contract's Yearly Budget years (Year 1 of 2, ...) — used for the Team/Transaction contract/year selectors, including in Forecast Settings where the contract may not be team-tracked yet. */
  teamYearsOf(contractRef: string): Array<{ year: number; label: string; from: string; to: string }> {
    const c = this.store.contracts().find((x) => x.reference === contractRef);
    if (!c) return [];
    return yearlyBudgetFor(c, childRecordsFor(c)).map((y) => ({ year: y.year, label: y.description.split(' — ')[0], from: y.startDate, to: y.endDate }));
  }
  /** The default team contract's Yearly Budget years. */
  teamYears(): Array<{ year: number; label: string; from: string; to: string }> {
    const c = this.teamContract();
    return c ? this.teamYearsOf(c.reference) : [];
  }
  /** Every real month across all of the salary contract's years, chronologically (it follows the contract, so years and their lengths can differ). */
  teamContractMonths(): string[] {
    return this.teamYears().flatMap((y) => this.monthsBetween(y.from, y.to));
  }

  private seedTeamMonths(): Record<string, Record<string, TeamMonth>> {
    const years = this.teamYears();
    const out: Record<string, Record<string, TeamMonth>> = {};
    for (const t of TEAM_SEED) {
      const hist: Record<string, TeamMonth> = {};
      for (const y of years) {
        this.monthsBetween(y.from, y.to).forEach((m, i) => {
          if (i < (t.from ?? 0)) return;
          hist[m] = { hc: t.hc[i] ?? 0, amount: t.amount[i] ?? 0, budget: t.budget[i] ?? 0 };
        });
      }
      out[t.name] = hist;
    }
    return out;
  }

  /** A team has joined by this month once it has a seeded or edited entry there. */
  started = (team: string, monthIso: string) => this.teamMonths()[team]?.[monthIso] !== undefined;
  teamHc = (team: string, monthIso: string) => this.teamMonths()[team]?.[monthIso]?.hc ?? 0;
  teamAmount = (team: string, monthIso: string) => this.teamMonths()[team]?.[monthIso]?.amount ?? 0;
  teamBudget = (team: string, monthIso: string) => this.teamMonths()[team]?.[monthIso]?.budget ?? 0;
  teamManual = (team: string, monthIso: string) => this.teamChanged().has(team + '|' + monthIso);
  /** The most recent month (before today) with a head count, for pricing a new head count at the team's cost per head. */
  private lastActualTeam(team: string) {
    const today = todayMonthStart();
    const months = Object.keys(this.teamMonths()[team] ?? {}).filter((m) => m < today).sort().reverse();
    for (const m of months) { const rec = this.teamMonths()[team][m]; if (rec.hc) return { hc: rec.hc, perHead: rec.amount / rec.hc }; }
    return { hc: 0, perHead: 0 };
  }

  /** A forecast month of one team: a new head count re-prices the amount at the team's cost per head unless an amount is typed. */
  setTeamMonth(team: string, monthIso: string, hc: number, amount: number | null, reason: string): string | null {
    if (monthIso < todayMonthStart()) return `${this.monthLabel(monthIso)} is closed with its actual figures.`;
    if (!Number.isInteger(hc) || hc < 0) return 'The head count must be a whole number, 0 or more.';
    if (amount !== null && (!isFinite(amount) || amount < 0)) return 'The amount cannot be negative.';
    if (!reason.trim()) return 'Enter the reason for the change.';
    const fromHc = this.teamHc(team, monthIso), fromAmt = this.teamAmount(team, monthIso);
    const nextAmt = amount ?? r3(hc * this.lastActualTeam(team).perHead);
    if (fromHc === hc && fromAmt === nextAmt) return 'Nothing was changed.';
    this.teamMonths.update((all) => ({ ...all, [team]: { ...(all[team] ?? {}), [monthIso]: { hc, amount: nextAmt, budget: this.teamBudget(team, monthIso) } } }));
    this.teamChanged.update((set) => new Set(set).add(team + '|' + monthIso));
    if (fromHc !== hc) this.record('Team', team, monthIso, 'Head count', fromHc, hc, reason);
    if (fromAmt !== nextAmt) this.record('Team', team, monthIso, 'Amount', fromAmt, nextAmt, reason);
    return null;
  }

  /** Each team's approved budget for the months given (it follows the contract, so months can differ) and its approved head count. */
  saveTeamBudgets(next: Array<{ name: string; budget: Record<string, number>; approvedHc: number | null }>) {
    const changes: string[] = [];
    const f = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 3 });
    this.teams.update((l) => l.map((t) => {
      const n = next.find((x) => x.name === t.name);
      if (!n) return t;
      const monthChanges: string[] = [];
      this.teamMonths.update((all) => {
        const rec = { ...(all[t.name] ?? {}) };
        for (const [monthIso, budget] of Object.entries(n.budget)) {
          const before = rec[monthIso]?.budget ?? 0;
          if (before !== budget) monthChanges.push(`${this.monthShortLabel(monthIso)} ${f(before)} → ${f(budget)}`);
          rec[monthIso] = { ...(rec[monthIso] ?? { hc: 0, amount: 0 }), budget };
        }
        return { ...all, [t.name]: rec };
      });
      if (!monthChanges.length && n.approvedHc === t.approvedHc) return t;
      changes.push(`${t.name}: ${monthChanges.join(', ')}${n.approvedHc !== t.approvedHc ? `${monthChanges.length ? ', ' : ''}head count ${t.approvedHc ?? '—'} → ${n.approvedHc ?? '—'}` : ''}`);
      return { ...t, approvedHc: n.approvedHc };
    }));
    if (changes.length) this.store.log('Forecast Settings Changed', 'Team approved budgets', changes.join('; '));
    return changes.length;
  }

  // ================= Accrual =================
  /** Every Yearly Budget line of every contract-year of every active contract. The UI scopes down to one contract + one year at a time. */
  readonly accrualRows = computed<AccrualRow[]>(() => {
    const approvals = this.store.yearlyBudgetApprovals();
    return this.store.contracts()
      .filter((c) => c.status !== 'Cancelled')
      .sort((a, b) => infolineFirst(a.vendorName, b.vendorName) || a.reference.localeCompare(b.reference))
      .flatMap((c) => yearlyBudgetFor(c, childRecordsFor(c)).flatMap((y) => y.lines.map((l): AccrualRow => ({
        key: `${c.reference}|L${l.line}`,
        id: `${c.reference}|Y${y.year}|L${l.line}`,
        vendor: c.vendorName,
        contract: c,
        po: c.poNumber ?? '',
        year: y.year,
        yearLabel: y.description,
        yearFrom: y.startDate,
        yearTo: y.endDate,
        lineNo: l.line,
        line: l.description,
        scope: l.scope,
        budget: approvals[`${c.id}:Y${y.year}:L${l.line}`] ?? l.allocated,
      }))));
  });

  /** The real calendar months (as ISO month-start dates) between two dates — a contract-year's own span, not a fixed financial year. */
  monthsBetween(from: string, to: string): string[] {
    const out: string[] = [];
    for (let s = from; s <= to; s = addMonths(from, out.length)) out.push(s);
    return out;
  }
  monthsOf(r: AccrualRow): string[] { return this.monthsBetween(r.yearFrom, r.yearTo); }
  monthLabel(monthIso: string): string { const d = new Date(monthIso); return `${MONTH_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
  monthShortLabel(monthIso: string): string { const d = new Date(monthIso); return `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
  isClosedMonth(monthIso: string): boolean { return monthIso < todayMonthStart(); }
  monthLabelOf(month: number | string): string { return typeof month === 'number' ? MONTH_LONG[month] : this.monthLabel(month); }

  /** Actual amounts: the invoices approved so far (seeded history) plus every line approved for payment in Reconciliation. Keyed by row key, then the real month-start ISO date. */
  readonly actuals = signal<Record<string, Record<string, number>>>({});
  /** The forecast entered for the line, keyed the same way; a missing entry means not entered yet. */
  readonly plan = signal<Record<string, Record<string, number>>>({});

  constructor() {
    const rows = this.accrualRows();
    this.actuals.set(this.seedActuals(rows));
    this.plan.set(this.seedPlan(rows));
    this.teamMonths.set(this.seedTeamMonths());
    this.txSettings.set(this.seedTxSettings());
    this.txMonths.set(this.seedTxMonths());
    // An approved line in Reconciliation replaces that month's forecast with the invoiced amount; the forecast is kept for comparison.
    effect(() => {
      const runs = this.store.invoiceRuns();
      untracked(() => {
        for (const run of Object.values(runs).flat()) {
          if (run.status !== 'Approved for payment') continue;
          const d = new Date('1 ' + run.period), l = run.lines[0];
          if (isNaN(+d) || !l) continue;
          const monthIso = new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10);
          if (this.actuals()[l.key]?.[monthIso] === l.vendorAmount) continue;
          this.actuals.update((a) => ({ ...a, [l.key]: { ...(a[l.key] ?? {}), [monthIso]: l.vendorAmount } }));
          this.store.log('Accrual Actualized', `${l.key.split('|')[0]} · ${l.label}`, `${this.monthLabel(monthIso)} forecast replaced by the approved invoice amount ${l.vendorAmount.toLocaleString('en-GB')} OMR.`);
        }
      });
    });
  }

  private monthlyShare(r: AccrualRow) {
    return r3(r.budget / Math.max(1, this.monthsOf(r).length));
  }
  /** Months from today until this contract-year line's expiry (its own end date, not the whole contract's). */
  monthsUntilExpiry(r: AccrualRow): number {
    const now = new Date(), end = new Date(r.yearTo);
    return Math.max(0, (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth()));
  }
  /** Approved budget left for this line once actuals and forecast (or a draft override) for its months are counted. */
  remainingWithDraft(r: AccrualRow, draft?: Record<string, number>): number {
    let total = 0;
    for (const m of this.monthsOf(r)) {
      const act = this.actuals()[r.key]?.[m];
      total += act !== undefined ? act : (draft?.[m] ?? this.forecastOf(r, m) ?? 0);
    }
    return r3(r.budget - total);
  }
  /**
   * The line's spending pace from its history: the average of the months already invoiced, projected over the months still open,
   * checked against the approved budget. runsOut = the first open month the budget no longer covers at that pace.
   */
  pace(r: AccrualRow) {
    const months = this.monthsOf(r), acts = this.actuals()[r.key] ?? {};
    const done = months.filter((m) => acts[m] !== undefined), open = months.filter((m) => acts[m] === undefined);
    const spent = r3(done.reduce((t, m) => t + acts[m], 0)), left = r3(r.budget - spent);
    if (!done.length) return { status: 'none' as const, avg: null, done: 0, open: open.length, spent, left, projected: null, gap: null, runsOut: null as string | null };
    const avg = r3(spent / done.length), projected = r3(spent + avg * open.length), gap = r3(r.budget - projected);
    const covered = avg > 0 ? Math.floor(Math.max(0, left) / avg) : open.length;
    const runsOut = covered < open.length ? open[covered] : null;
    const status = !open.length ? (left < -0.001 ? 'short' as const : 'ok' as const) : gap < -0.001 ? 'short' as const : 'ok' as const;
    return { status, avg, done: done.length, open: open.length, spent, left, projected, gap, runsOut };
  }
  /** On-screen flag: projects the open months at the invoiced-so-far average and says if the approved budget is not enough. */
  runRate(r: AccrualRow): { over: boolean; message: string } | null {
    const p = this.pace(r);
    if (p.avg === null || !p.open) return null;
    const f = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 0 });
    const over = p.status === 'short';
    return { over, message: over ? `At the average pace so far (${f(p.avg)} OMR/month), the projected total is ${f(p.projected!)} OMR — ${f(-p.gap!)} OMR over the ${f(r.budget)} OMR approved budget${p.runsOut ? `; the budget runs out in ${this.monthLabel(p.runsOut)}` : ''}.` : `On track — projected ${f(p.projected!)} of ${f(r.budget)} OMR approved.` };
  }
  private sheetBase(r: AccrualRow, monthIso: string) {
    const sheet = r.contract.reference === INFOLINE_REF ? PER_LINE[norm(r.line)] : undefined;
    const i = this.monthsOf(r).indexOf(monthIso);
    return sheet ? fill(sheet)[i] : r.contract.reference === INFOLINE_REF ? 0 : this.monthlyShare(r);
  }

  /** Two contract-years share a row `key` (see AccrualRow.id); their real months never collide, so merge rather than overwrite. */
  private seedActuals(rows: AccrualRow[]) {
    const today = todayMonthStart();
    const out: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      const hist: Record<string, number> = out[r.key] ?? {};
      for (const m of this.monthsOf(r)) {
        if (m >= today) continue;
        hist[m] = r.contract.reference === INFOLINE_REF ? this.sheetBase(r, m) : r3(this.sheetBase(r, m) * (0.94 + (hash(r.key + m) % 13) / 100));
      }
      out[r.key] = hist;
    }
    return out;
  }

  /** The forecast the team entered at the start of the year: a figure per month, rounded like a hand-made plan. */
  private seedPlan(rows: AccrualRow[]) {
    const out: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      const hist: Record<string, number> = out[r.key] ?? {};
      for (const m of this.monthsOf(r)) {
        const base = this.sheetBase(r, m), step = base >= 1000 ? 100 : 10;
        hist[m] = Math.round((base * (0.95 + (hash(r.key + 'p' + m) % 11) / 100)) / step) * step;
      }
      out[r.key] = hist;
    }
    return out;
  }

  forecastOf(r: AccrualRow, monthIso: string): number | null {
    return this.plan()[r.key]?.[monthIso] ?? null;
  }

  /** Resolves the right contract-year row for a shared key + month (two years can share a key; a real month can only ever belong to one). */
  rowFor(key: string, monthIso: string): AccrualRow | undefined {
    const candidates = this.accrualRows().filter((r) => r.key === key);
    return candidates.find((r) => this.monthsOf(r).includes(monthIso)) ?? candidates[0];
  }

  /** What one line shows in one month: the approved invoice amount once there is one, otherwise the forecast. */
  cell(r: AccrualRow, monthIso: string): AccrualCell {
    const forecast = this.forecastOf(r, monthIso), act = this.actuals()[r.key]?.[monthIso];
    const f = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 3 });
    if (act !== undefined) return { value: act, forecast, actual: true, awaiting: false, source: `Actual — approved invoice ${f(act)} OMR` + (forecast !== null ? ` · forecast was ${f(forecast)} (${act - forecast >= 0 ? '+' : ''}${f(r3(act - forecast))})` : '') };
    const awaiting = monthIso < todayMonthStart();
    return { value: forecast ?? 0, forecast, actual: false, awaiting, source: (forecast === null ? 'No forecast entered' : 'Yearly forecast') + (awaiting ? ' · invoice not approved yet' : '') };
  }

  /** Saves the yearly forecast typed on the Accrual screen. Months with an approved invoice are skipped. */
  setPlan(changes: Array<{ r: AccrualRow; m: string; value: number }>, note: string): string | null {
    const ok = changes.filter(({ r, m }) => this.monthsOf(r).includes(m) && this.actuals()[r.key]?.[m] === undefined);
    if (ok.some((c) => !isFinite(c.value) || c.value < 0)) return 'Amounts cannot be negative.';
    const real = ok.filter((c) => (this.plan()[c.r.key]?.[c.m] ?? null) !== c.value);
    if (!real.length) return 'Nothing was changed.';
    // A row key can be shared by two contract-years (see AccrualRow.id); check each year's own budget against only its own months.
    // Blocks only edits that push the line further over its budget — a line already over budget from actuals alone can still be adjusted, just not made worse.
    const allRows = this.accrualRows();
    for (const key of new Set(real.map((c) => c.r.key))) {
      const changesForKey = real.filter((c) => c.r.key === key);
      for (const r of allRows.filter((x) => x.key === key)) {
        const draft = Object.fromEntries(changesForKey.filter((c) => this.monthsOf(r).includes(c.m)).map((c) => [c.m, c.value]));
        if (!Object.keys(draft).length) continue;
        const before = this.remainingWithDraft(r), after = this.remainingWithDraft(r, draft);
        if (after < before - 0.001 && after < -0.001) return `${r.line} (${r.yearLabel.split(' — ')[0]}) would exceed its approved budget of ${r.budget.toLocaleString('en-GB')} OMR.`;
      }
    }
    if (!note.trim()) return 'Enter a note for this forecast (for example "FY forecast" or the reason for the change).';
    const before = real.map((c) => this.plan()[c.r.key]?.[c.m] ?? null);
    this.plan.update((p) => {
      const n = { ...p };
      for (const c of real) n[c.r.key] = { ...(n[c.r.key] ?? {}), [c.m]: c.value };
      return n;
    });
    real.forEach((c, i) => this.record('Accrual', `${c.r.contract.reference} · ${c.r.line}`, c.m, 'Forecast', before[i], c.value, note, false));
    const lines = new Set(real.map((c) => c.r.key)).size;
    this.store.log('Accrual Forecast Updated', `${lines} line(s)`, `${real.length} month figure(s) changed. Note: ${note.trim()}`);
    return null;
  }

  setTxSettings(contractRef: string, budget: number, rates: Record<string, number>) {
    const before = this.txSettings()[contractRef] ?? { budget: 0, rates: Object.fromEntries(TX_TYPES.map((t) => [t.type, 0])) };
    const changes = [budget !== before.budget && `Approved budget ${before.budget.toLocaleString('en-GB')} → ${budget.toLocaleString('en-GB')} OMR`, ...Object.keys(rates).filter((k) => rates[k] !== before.rates[k]).map((k) => `${k} rate ${before.rates[k]} → ${rates[k]} OMR`)].filter(Boolean);
    if (!changes.length) return 0;
    this.txSettings.update((all) => ({ ...all, [contractRef]: { budget, rates: { ...rates } } }));
    this.store.log('Forecast Settings Changed', 'Transaction forecast', changes.join('; '));
    return changes.length;
  }

  private record(kind: ForecastKind, item: string, month: number | string, field: string, from: number | null, to: number | null, reason: string, log = true) {
    const e: ForecastEdit = { id: this.id('FE'), at: new Date().toISOString(), by: CURRENT_USER, kind, item, month, field, from, to, reason: reason.trim() };
    this.edits.update((l) => [e, ...l]);
    const f = (n: number | null) => (n === null ? '—' : n.toLocaleString('en-GB', { maximumFractionDigits: 3 }));
    if (log) this.store.log(`${kind} Forecast Updated`, `${item} · ${this.monthLabelOf(month)}`, `${field}: ${f(from)} → ${f(to)}. Reason: ${e.reason}`);
  }

  // ================= Excel exports (same layout as the sheets) =================
  /**
   * Excel export in the layout of Omantel's own accrual sheet ("Per Line"): gold header, supplier / contract / PO merged per contract,
   * dated month columns, actual months plain and forecast months tinted. Adds the pace indicator: at the average of the invoiced
   * months, is the approved budget enough for the months still open, and in which month does it run out.
   */
  exportAccrual(rows: AccrualRow[]) {
    if (!rows.length) { this.ui.toast('Nothing to export.'); return undefined; }
    const f0 = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 0 });
    const months = [...new Set(rows.flatMap((r) => this.monthsOf(r)))].sort();
    const yr = (r: AccrualRow) => r.yearLabel.split(' — ')[0];
    const lead = ['SUPPLIER NAME', 'CONTRACT', 'PO NO.', 'CONTRACT TYPE', 'SCOPE OF WORK', 'YEAR OF BUDGET', 'FROM', 'TO', 'APPROVED BUDGET'];
    const tail = ['ACTUAL (APPROVED INVOICES)', 'FORECAST (OPEN MONTHS)', 'EXPECTED TOTAL', 'REMAINING BUDGET', 'AVG MONTHLY SPEND (HISTORY)', 'PROJECTED TOTAL AT THIS PACE', 'BUDGET RUNS OUT IN', 'INDICATOR — IS THE BUDGET ENOUGH AT THE CURRENT PACE?'];
    const monthHead: XCell[] = months.map((m) => ({ v: m, s: 'headDate', date: true }));
    const indicator = (r: AccrualRow): XCell => {
      const p = this.pace(r);
      if (p.avg === null) return { v: 'No invoice yet — no history to project from.', s: 'none' };
      if (!p.open) return p.left < -0.001 ? { v: `Year complete — over the approved budget by ${f0(-p.left)} OMR.`, s: 'short' } : { v: `Year complete — within budget (${f0(p.left)} OMR unused).`, s: 'ok' };
      if (p.left < -0.001) return { v: `NOT ENOUGH — the budget is already used up (${f0(-p.left)} OMR over); at ${f0(p.avg)} OMR/month the ${p.open} open month(s) add ${f0(p.avg * p.open)} OMR more.`, s: 'short' };
      if (p.status === 'short') return { v: `NOT ENOUGH — at ${f0(p.avg)} OMR/month (average of ${p.done} invoiced month(s)) the budget runs out in ${this.monthShortLabel(p.runsOut!)}; short by ${f0(-p.gap!)} OMR for the ${p.open} open month(s).`, s: 'short' };
      return { v: `Enough — at ${f0(p.avg)} OMR/month the budget covers the ${p.open} open month(s), ${f0(p.gap!)} OMR left.`, s: 'ok' };
    };

    const build = (kind: 'main' | 'plan'): XSheet => {
      const head = [...lead.map((v): XCell => ({ v, s: 'head' })), ...monthHead, ...(kind === 'main' ? tail : ['YEARLY FORECAST TOTAL']).map((v): XCell => ({ v, s: 'head' }))];
      const width = head.length;
      const out: XCell[][] = [
        [{ v: `Accrual Forecast — ${rows[0].vendor} · ${rows[0].contract.reference} · ${yr(rows[0])}`, s: 'title' }],
        [{ v: kind === 'main' ? 'Amounts in OMR. White = actual (approved invoice) · blue = forecast · yellow = past month still waiting for its invoice approval. The indicator projects the open months at the average of the invoiced months.' : 'The forecast entered for every month of the year (kept after the invoice is approved, for comparison).', s: 'note' }],
        [],
        head,
      ];
      const merges: string[] = [];
      const col = (i: number) => (i >= 26 ? String.fromCharCode(64 + Math.floor(i / 26)) : '') + String.fromCharCode(65 + (i % 26));
      const groups = [...new Set(rows.map((r) => r.contract.reference + '|' + r.year))];
      const grand = new Array(width).fill(0);
      for (const g of groups) {
        const gr = rows.filter((r) => r.contract.reference + '|' + r.year === g), first = out.length + 1, sums = new Array(width).fill(0);
        for (const r of gr) {
          const cells = months.map((m) => (this.monthsOf(r).includes(m) ? this.cell(r, m) : null));
          const nums: number[] = [];
          const monthCells: XCell[] = cells.map((c) => {
            if (!c) return { v: null, s: 'money' };
            const v = kind === 'main' ? c.value ?? 0 : c.forecast ?? 0;
            nums.push(v);
            return { v, s: kind === 'plan' ? 'moneyF' : c.actual ? 'money' : c.awaiting ? 'moneyA' : 'moneyF' };
          });
          const real = cells.filter((c): c is AccrualCell => !!c);
          const actual = r3(real.filter((c) => c.actual).reduce((t, c) => t + (c.value ?? 0), 0));
          const forecast = r3(real.filter((c) => !c.actual).reduce((t, c) => t + (c.value ?? 0), 0));
          const p = this.pace(r);
          const tailCells: XCell[] = kind === 'main'
            ? [{ v: actual, s: 'money' }, { v: forecast, s: 'moneyF' }, { v: r3(actual + forecast), s: 'money' }, { v: r3(r.budget - actual - forecast), s: 'money' }, { v: p.avg, s: 'money' }, { v: p.projected, s: 'money' }, { v: p.avg === null ? '' : p.open && p.left < -0.001 ? 'Already used up' : p.runsOut ? this.monthShortLabel(p.runsOut) : '—', s: p.open && (p.runsOut || p.left < -0.001) ? 'short' : 'text' }, indicator(r)]
            : [{ v: r3(real.reduce((t, c) => t + (c.forecast ?? 0), 0)), s: 'money' }];
          const row: XCell[] = [
            { v: r.vendor, s: 'group' }, { v: r.contract.reference, s: 'group' }, { v: r.po, s: 'group' }, { v: r.contract.contractType, s: 'group' },
            { v: r.line, s: 'text' }, { v: yr(r), s: 'group' }, { v: r.yearFrom, s: 'group' }, { v: r.yearTo, s: 'group' }, { v: r.budget, s: 'money' },
            ...monthCells, ...tailCells,
          ];
          row.forEach((c, i) => { if (typeof c.v === 'number' && i >= 8 && c.s !== 'text') sums[i] += c.v; });
          out.push(row);
        }
        const last = out.length;
        if (last > first) for (const i of [0, 1, 2, 3, 5, 6, 7]) merges.push(`${col(i)}${first}:${col(i)}${last}`);
        const short = gr.filter((r) => this.pace(r).status === 'short').length;
        const sub: XCell[] = [{ v: `Total — ${gr[0].contract.reference} · ${yr(gr[0])}`, s: 'subText' }, ...Array.from({ length: 7 }, (): XCell => ({ v: null, s: 'subText' })), ...sums.slice(8).map((v, i): XCell => ({ v: i + 8 === width - 2 && kind === 'main' ? '' : r3(v), s: 'subMoney' }))];
        if (kind === 'main') sub[width - 1] = short ? { v: `${short} of ${gr.length} line(s) will NOT have enough budget at the current pace.`, s: 'short' } : { v: `All ${gr.length} line(s) have enough budget at the current pace.`, s: 'ok' };
        out.push(sub);
        merges.push(`A${out.length}:H${out.length}`);
        sums.forEach((v, i) => (grand[i] += v));
      }
      if (groups.length > 1) {
        out.push([{ v: 'GRAND TOTAL', s: 'totText' }, ...Array.from({ length: 7 }, (): XCell => ({ v: null, s: 'totText' })), ...grand.slice(8).map((v): XCell => ({ v: r3(v), s: 'totMoney' }))]);
        merges.push(`A${out.length}:H${out.length}`);
      }
      return {
        name: kind === 'main' ? 'Accrual Forecast' : 'Yearly Forecast', rows: out, merges, freeze: { row: 4, col: 5 }, heights: { 1: 24, 4: 44 },
        widths: [26, 17, 12, 20, 34, 13, 11, 11, 15, ...months.map(() => 13), ...(kind === 'main' ? [15, 15, 15, 15, 15, 16, 13, 62] : [16])],
      };
    };

    const stamp = new Date();
    const info: XSheet = {
      name: 'Report Info', widths: [26, 90],
      rows: [
        [{ v: 'Accrual Forecast — export information', s: 'title' }], [],
        ...([['Contract', `${rows[0].vendor} · ${rows[0].contract.reference} (PO ${rows[0].po})`], ['Year of budget', `${yr(rows[0])}: ${rows[0].yearFrom} → ${rows[0].yearTo}`], ['Exported by', CURRENT_USER], ['Export date and time', stamp.toLocaleString('en-GB')], ['Amounts', 'OMR']] as Array<[string, string]>).map(([k, v]): XCell[] => [{ v: k, s: 'key' }, { v, s: 'plain' }]),
        [],
        [{ v: 'Colours', s: 'key' }, { v: 'Actual — the approved invoice amount of the month', s: 'text' }],
        [{ v: '', s: 'key' }, { v: 'Forecast — no approved invoice yet', s: 'moneyF' }],
        [{ v: '', s: 'key' }, { v: 'Past month still on forecast — its invoice is not approved yet', s: 'moneyA' }],
        [],
        [{ v: 'Indicator', s: 'key' }, { v: 'Average monthly spend = total of the invoiced months ÷ their number (the history). Projected total = invoiced so far + that average × the months still open.', s: 'plain' }],
        [{ v: '', s: 'key' }, { v: 'Enough — the approved budget covers the open months at that pace.', s: 'ok' }],
        [{ v: '', s: 'key' }, { v: 'NOT ENOUGH — at that pace the budget runs out before the end of the year (the month is shown), and by how much it falls short.', s: 'short' }],
      ],
    };
    const file = `Accrual_Forecast_${rows[0].contract.reference}_${yr(rows[0]).replace(/\s+/g, '_')}`;
    const name = this.ui.xlsxStyled(file, [build('main'), build('plan'), info]);
    const short = rows.filter((r) => this.pace(r).status === 'short').length;
    this.store.log('Forecast Exported', name, `Accrual forecast exported (${rows.length} line(s)); ${short} line(s) will not have enough budget at the current pace.`);
    this.ui.toast(`Downloaded ${name}.`);
    return name;
  }

  /** Excel export in the layout of Omantel's own "Budget Forecasting By Team.xlsx": one row per team, dated month columns, actual months plain and forecast months tinted. `months` is the year currently shown on screen. */
  exportTeam(months: string[], contractRef?: string) {
    if (!months.length) { this.ui.toast('Nothing to export.'); return undefined; }
    const c = (contractRef ? this.teamContracts().find((x) => x.reference === contractRef) : undefined) ?? this.teamContract();
    const yearLabel = (c ? this.teamYearsOf(c.reference) : []).find((y) => months[0] >= y.from && months[0] <= y.to)?.label ?? '';
    const monthHead: XCell[] = months.map((m): XCell => ({ v: m, s: 'headDate', date: true }));
    const head: XCell[] = [
      { v: 'TEAM', s: 'head' }, { v: 'APPROVED HC', s: 'head' }, { v: 'HEAD COUNT', s: 'head' }, ...monthHead,
      { v: 'APPROVED BUDGET', s: 'head' }, { v: 'ACCRUAL', s: 'head' }, { v: 'FORECAST', s: 'head' }, { v: 'TOTAL', s: 'head' }, { v: 'SAVING', s: 'head' }, { v: 'SAVING %', s: 'head' },
    ];
    const width = head.length;
    const out: XCell[][] = [
      [{ v: `Team Forecast — PO ${c?.poNumber ?? ''} · ${yearLabel}`, s: 'title' }],
      [{ v: 'Amounts in OMR. White = actual (the month is closed) · blue = forecast (the month is still open). Saving = approved budget − (accrual + forecast).', s: 'note' }],
      [],
      head,
    ];
    const grand = new Array(width).fill(0);
    for (const t of this.teams()) {
      const cells = months.map((m) => ({ closed: this.isClosedMonth(m), amount: this.teamAmount(t.name, m) }));
      const accrual = r3(cells.filter((x) => x.closed).reduce((s, x) => s + x.amount, 0));
      const forecast = r3(cells.filter((x) => !x.closed).reduce((s, x) => s + x.amount, 0));
      const budget = r3(months.reduce((s, m) => s + this.teamBudget(t.name, m), 0));
      const total = r3(accrual + forecast), saving = r3(budget - total), pct = budget ? r3((saving / budget) * 100) : 0;
      const asOf = [...months].reverse().find((m) => this.started(t.name, m)) ?? months[0];
      const monthCells: XCell[] = cells.map((x): XCell => ({ v: x.amount, s: x.closed ? 'money' : 'moneyF' }));
      const row: XCell[] = [
        { v: t.name, s: 'text' }, { v: t.approvedHc ?? '', s: 'int' }, { v: this.teamHc(t.name, asOf), s: 'int' }, ...monthCells,
        { v: budget, s: 'money' }, { v: accrual, s: 'money' }, { v: forecast, s: 'moneyF' }, { v: total, s: 'money' }, { v: saving, s: saving < -0.001 ? 'short' : 'ok' }, { v: pct, s: 'text' },
      ];
      row.forEach((cell, i) => { if (typeof cell.v === 'number' && i >= 3) grand[i] += cell.v; });
      out.push(row);
    }
    const totalBudget = r3(grand[width - 5]), totalAccrual = r3(grand[width - 4]), totalForecast = r3(grand[width - 3]), totalSaving = r3(grand[width - 2]);
    out.push([
      { v: 'GRAND TOTAL', s: 'totText' }, { v: null, s: 'totText' }, { v: null, s: 'totText' }, ...months.map((_, i): XCell => ({ v: r3(grand[3 + i]), s: 'totMoney' })),
      { v: totalBudget, s: 'totMoney' }, { v: totalAccrual, s: 'totMoney' }, { v: totalForecast, s: 'totMoney' }, { v: r3(totalAccrual + totalForecast), s: 'totMoney' }, { v: totalSaving, s: 'totMoney' }, { v: totalBudget ? r3((totalSaving / totalBudget) * 100) : 0, s: 'totMoney' },
    ]);

    const stamp = new Date();
    const info: XSheet = {
      name: 'Report Info', widths: [26, 90],
      rows: [
        [{ v: 'Team Forecast — export information', s: 'title' }], [],
        ...([['Contract', c ? `${c.vendorName} · ${c.reference} (PO ${c.poNumber})` : '—'], ['Year of budget', yearLabel], ['Exported by', CURRENT_USER], ['Export date and time', stamp.toLocaleString('en-GB')], ['Amounts', 'OMR']] as Array<[string, string]>).map(([k, v]): XCell[] => [{ v: k, s: 'key' }, { v, s: 'plain' }]),
        [],
        [{ v: 'Colours', s: 'key' }, { v: 'Actual — the month is closed with its accrual amount', s: 'text' }],
        [{ v: '', s: 'key' }, { v: 'Forecast — the month is still open', s: 'moneyF' }],
      ],
    };
    const file = `Team_Forecast_${c?.reference ?? 'PO'}_${yearLabel.replace(/\s+/g, '_')}`;
    const name = this.ui.xlsxStyled(file, [
      { name: 'Team Forecast', rows: out, merges: [], freeze: { row: 4, col: 3 }, heights: { 1: 24, 4: 32 }, widths: [26, 12, 12, ...months.map(() => 12), 15, 13, 13, 13, 13, 11] },
      info,
    ]);
    this.store.log('Forecast Exported', name, `Team forecast exported (${this.teams().length} team(s), ${months.length} month(s)).`);
    this.ui.toast(`Downloaded ${name}.`);
    return name;
  }

  /** Excel export in the layout of Omantel's own "Actual Forecast Spending per month - Transaction.xlsx": one row per month, actual rows plain and forecast rows tinted. `months` is the year currently shown on screen. */
  exportTransactions(months: string[], contractRef?: string) {
    if (!months.length) { this.ui.toast('Nothing to export.'); return undefined; }
    const c = (contractRef ? this.teamContracts().find((x) => x.reference === contractRef) : undefined) ?? this.teamContract();
    const ref = c?.reference ?? '';
    const yearLabel = (c ? this.teamYearsOf(c.reference) : []).find((y) => months[0] >= y.from && months[0] <= y.to)?.label ?? '';
    const head: XCell[] = [
      { v: 'MONTH', s: 'head' },
      ...TX_TYPES.flatMap((t): XCell[] => [{ v: `${t.type.toUpperCase()} — TRANSACTIONS`, s: 'head' }, { v: `${t.type.toUpperCase()} — AMOUNT`, s: 'head' }, { v: `${t.type.toUpperCase()} — OMR/TX`, s: 'head' }]),
      { v: 'TOTAL AMOUNT', s: 'head' },
    ];
    const out: XCell[][] = [
      [{ v: `Transaction Forecast — ${c ? c.vendorName + ' · ' + c.reference : ''} · ${yearLabel}`, s: 'title' }],
      [{ v: 'Amounts in OMR. White = actual (invoiced) · blue = forecast (expected transactions × unit rate).', s: 'note' }],
      [],
      head,
    ];
    for (const m of months) {
      const closed = this.isClosedMonth(m);
      const cells = TX_TYPES.map((t) => { const tx = this.txCount(t.type, m), amount = this.txAmount(t.type, m, ref); return { tx, amount, rate: tx ? r3(amount / tx) : 0 }; });
      const total = r3(cells.reduce((s, x) => s + x.amount, 0));
      out.push([
        { v: m, s: 'headDate', date: true },
        ...cells.flatMap((x): XCell[] => [{ v: x.tx, s: 'int' }, { v: x.amount, s: closed ? 'money' : 'moneyF' }, { v: x.rate, s: 'text' }]),
        { v: total, s: closed ? 'money' : 'moneyF' },
      ]);
    }
    const totalsByType = TX_TYPES.map((t) => {
      const tx = r3(months.reduce((s, m) => s + this.txCount(t.type, m), 0));
      const amount = r3(months.reduce((s, m) => s + this.txAmount(t.type, m, ref), 0));
      return { tx, amount, rate: tx ? r3(amount / tx) : 0 };
    });
    const grandTotal = r3(totalsByType.reduce((s, t) => s + t.amount, 0));
    out.push([
      { v: 'GRAND TOTAL', s: 'totText' },
      ...totalsByType.flatMap((t): XCell[] => [{ v: t.tx, s: 'totMoney' }, { v: t.amount, s: 'totMoney' }, { v: t.rate, s: 'totMoney' }]),
      { v: grandTotal, s: 'totMoney' },
    ]);

    const stamp = new Date();
    const info: XSheet = {
      name: 'Report Info', widths: [26, 90],
      rows: [
        [{ v: 'Transaction Forecast — export information', s: 'title' }], [],
        ...([['Contract', c ? `${c.vendorName} · ${c.reference} (PO ${c.poNumber})` : '—'], ['Year of budget', yearLabel], ['Approved budget', `${r3(this.txBudgetOf(ref))} OMR`], ...TX_TYPES.map((t) => [`${t.type} rate`, `${this.txRatesOf(ref)[t.type]} OMR per transaction`]), ['Exported by', CURRENT_USER], ['Export date and time', stamp.toLocaleString('en-GB')], ['Amounts', 'OMR']] as Array<[string, string]>).map(([k, v]): XCell[] => [{ v: k, s: 'key' }, { v, s: 'plain' }]),
        [],
        [{ v: 'Colours', s: 'key' }, { v: 'Actual — the month is closed with its invoiced amount', s: 'text' }],
        [{ v: '', s: 'key' }, { v: 'Forecast — expected transactions × unit rate', s: 'moneyF' }],
      ],
    };
    const file = `Transaction_Forecast_${c?.reference ?? 'PO'}_${yearLabel.replace(/\s+/g, '_')}`;
    const name = this.ui.xlsxStyled(file, [
      { name: 'Transaction Forecast', rows: out, freeze: { row: 4, col: 1 }, heights: { 1: 24, 4: 32 }, widths: [14, ...TX_TYPES.flatMap(() => [14, 13, 11]), 14] },
      info,
    ]);
    this.store.log('Forecast Exported', name, `Transaction forecast exported (${months.length} month(s)).`);
    this.ui.toast(`Downloaded ${name}.`);
    return name;
  }

  private save(stem: string, title: string, rows: Array<Record<string, any>>, note: string, extra: Array<{ name: string; rows: Array<Record<string, any>> }> = []) {
    const stamp = new Date();
    const meta = [['Report', title], ['Financial year', FY_LABEL], ['Actual months', CUR_MONTH ? `January – ${MONTH_LONG[CUR_MONTH - 1]}` : 'None yet'], ['Forecast months', `${MONTH_LONG[CUR_MONTH]} – December`], ['Notes', note], ['Exported by', CURRENT_USER], ['Export date and time', stamp.toLocaleString('en-GB')]].map(([Field, Value]) => ({ Field, Value }));
    const name = this.ui.xlsxSheets(`${stem}_${FY_LABEL}`, [{ name: title, rows }, ...extra, { name: 'Report Info', rows: meta }], false);
    if (name) { this.store.log('Forecast Exported', name, `${title} exported (${rows.length} rows).`); this.ui.toast(`Downloaded ${name}.`); }
    return name;
  }
}
