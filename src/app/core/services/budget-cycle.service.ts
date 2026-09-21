import { Injectable, computed, inject, signal } from '@angular/core';
import { CURRENT_USER, CrcStore } from './crc-store.service';
import { ProjectRequests } from './project-requests.service';
import { CURRENT_FY, PREVIOUS_FY, ProjectRequest, projectTotal, resourceCost } from './project-data';

/** Budget preparation for the next financial year (SRS "Budget Preparation Requirements"). */
export type CycleStatus = 'Not Started' | 'Draft' | 'Under Review' | 'Ready for Submission' | 'Submitted' | 'Reopened' | 'Closed';
export const CYCLE_STATUSES: CycleStatus[] = ['Not Started', 'Draft', 'Under Review', 'Ready for Submission', 'Submitted', 'Reopened', 'Closed'];

export interface OutsourcingLine {
  id: string;
  vendor: string;
  contract: string;
  category: string;
  prevHC: number;
  hc: number;
  /** Head count per month (Jan–Dec) — can differ during the year for recruitment, resignation or expansion. */
  monthlyHC: number[];
  /** Monthly salary per head, OMR. */
  prevSalary: number;
  salary: number;
  prevIncentive: number;
  incentive: number;
  prevOvertime: number;
  overtime: number;
  prevOjt: number;
  ojt: number;
  other: number;
  reason: string;
  /** Notes or assumptions behind the line (BR-OUT-001). */
  notes: string;
}

/** `monthly` is set when the user typed amounts month by month; otherwise the annual amount is spread evenly. */
export interface PettyLine { id: string; category: string; prev: number; adjustment: number; reason: string; monthly?: number[] }

export interface Submission {
  version: number;
  reference: string;
  at: string;
  by: string;
  total: number;
  fileName: string;
  recipients: string;
  emailStatus: 'Sent' | 'Failed';
  emailError?: string;
}

export interface CycleSettings { year: string; cycleName: string; departments: string[]; cutOff: string; increasePct: number; warnPct: number; to: string; cc: string; bcc: string }
export interface Issue { level: 'error' | 'warning'; text: string }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_NAMES = MONTHS;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const iso = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const flat = (n: number) => Array.from({ length: 12 }, () => n);

const out = (id: string, category: string, hc: number, prevAnnualSalary: number, inc: number, ot: number, ojt: number): OutsourcingLine => {
  const monthly = r3(prevAnnualSalary / (hc * 12));
  return { id, vendor: 'Infoline LLC', contract: '2025-013T-00-01', category, prevHC: hc, hc, monthlyHC: flat(hc), prevSalary: monthly, salary: monthly, prevIncentive: inc, incentive: inc, prevOvertime: ot, overtime: ot, prevOjt: ojt, ojt, other: 0, reason: '', notes: '' };
};

@Injectable({ providedIn: 'root' })
export class BudgetCycle {
  private store = inject(CrcStore);
  private projects = inject(ProjectRequests);
  private seq = 0;

  readonly status = signal<CycleStatus>('Draft');
  readonly settings = signal<CycleSettings>({ year: CURRENT_FY, cycleName: `${CURRENT_FY} annual budget`, departments: ['Customer Care Unit'], cutOff: iso(45), increasePct: 5, warnPct: 15, to: 'budget.team@omantel.om', cc: 'finance.planning@omantel.om', bcc: '' });
  readonly submissions = signal<Submission[]>([]);
  readonly reopenLog = signal<Array<{ at: string; by: string; reason: string }>>([]);

  /** Previous year: 141,500 OMR in total (114,500 outsourcing, 9,000 OJT, 3,000 petty cash, 15,000 projects). */
  readonly outsourcing = signal<OutsourcingLine[]>([
    out('OUT-1', 'Bachelor tier (PO1)', 4, 26000, 0, 0, 2000),
    out('OUT-2', 'Diploma tier (PO2)', 7, 39500, 0, 0, 3000),
    out('OUT-3', 'Non-Diploma tier (PO3 - Outsource)', 8, 38800, 6000, 4200, 4000),
  ]);
  readonly petty = signal<PettyLine[]>([
    { id: 'PC-1', category: 'Office supplies', prev: 1200, adjustment: 0, reason: '' },
    { id: 'PC-2', category: 'Travel reimbursements', prev: 600, adjustment: 0, reason: '' },
    { id: 'PC-3', category: 'Minor repairs', prev: 500, adjustment: 0, reason: '' },
    { id: 'PC-4', category: 'Administrative expenses', prev: 700, adjustment: 0, reason: '' },
  ]);

  // ---------- baseline maths ----------
  private pct = computed(() => this.settings().increasePct);
  sys = (prev: number) => Math.round(prev * (1 + this.pct() / 100));
  sysSalary = (prev: number) => r3(prev * (1 + this.pct() / 100));

  salaryAnnual = (l: OutsourcingLine) => r3(l.monthlyHC.reduce((s, h) => s + h * l.salary, 0));
  annual = (l: OutsourcingLine) => Math.round(this.salaryAnnual(l) + l.incentive + l.overtime + l.ojt + l.other);
  prevAnnual = (l: OutsourcingLine) => Math.round(l.prevHC * l.prevSalary * 12 + l.prevIncentive + l.prevOvertime + l.prevOjt);
  systemAnnual = (l: OutsourcingLine) => Math.round(l.prevHC * this.sysSalary(l.prevSalary) * 12 + this.sys(l.prevIncentive) + this.sys(l.prevOvertime) + this.sys(l.prevOjt));
  pettySystem = (l: PettyLine) => this.sys(l.prev);
  pettyFinal = (l: PettyLine) => this.pettySystem(l) + l.adjustment;
  /** The twelve monthly amounts of a petty cash line; an even spread puts any rounding remainder in December. */
  pettyMonths = (l: PettyLine): number[] => {
    if (l.monthly) return l.monthly;
    const f = this.pettyFinal(l), each = Math.floor(f / 12);
    return Array.from({ length: 12 }, (_, i) => (i === 11 ? f - each * 11 : each));
  };

  /** Why a change needs a reason (BR-OUT-007), or null when none is needed. */
  reasonNeeded(l: OutsourcingLine): string | null {
    if (l.hc > l.prevHC) return 'the head count was increased';
    if (l.hc < l.prevHC) return 'the head count was reduced';
    if (this.annual(l) < this.prevAnnual(l)) return 'the proposed amount is lower than last year';
    if (this.annual(l) > this.systemAnnual(l)) return 'the proposed amount exceeds the automatically calculated amount';
    if (this.status() === 'Reopened' && l.reason.trim() === '') return 'the budget is being modified after submission';
    return null;
  }

  // ---------- projects ----------
  private inYear = (year: string) => this.projects.projects().filter((p) => p.financialYear === year);
  readonly projectsIncluded = computed(() => this.inYear(this.settings().year).filter((p) => p.status === 'Included in Budget'));
  readonly projectsPending = computed(() => this.inYear(this.settings().year).filter((p) => ['Draft', 'Submitted', 'Returned for Modification'].includes(p.status)));
  readonly prevProjects = computed(() => this.inYear(PREVIOUS_FY).filter((p) => p.status === 'Included in Budget'));

  // ---------- totals ----------
  readonly totals = computed(() => {
    const o = this.outsourcing();
    const salaries = o.reduce((s, l) => s + this.salaryAnnual(l), 0);
    const incentives = o.reduce((s, l) => s + l.incentive, 0);
    const overtime = o.reduce((s, l) => s + l.overtime, 0);
    const ojt = o.reduce((s, l) => s + l.ojt, 0);
    const other = o.reduce((s, l) => s + l.other, 0);
    const outsourcing = Math.round(salaries + incentives + overtime + ojt + other);
    const petty = this.petty().reduce((s, l) => s + this.pettyFinal(l), 0);
    const projects = this.projectsIncluded().reduce((s, p) => s + projectTotal(p), 0);
    const prevOut = o.reduce((s, l) => s + this.prevAnnual(l), 0);
    const prevPetty = this.petty().reduce((s, l) => s + l.prev, 0);
    const prevProjects = this.prevProjects().reduce((s, p) => s + projectTotal(p), 0);
    const total = outsourcing + petty + projects;
    const previous = prevOut + prevPetty + prevProjects;
    const headCount = o.reduce((s, l) => s + l.hc, 0) + this.projectsIncluded().reduce((s, p) => s + p.headCount, 0);
    const prevHeadCount = o.reduce((s, l) => s + l.prevHC, 0) + this.prevProjects().reduce((s, p) => s + p.headCount, 0);
    return { salaries: Math.round(salaries), incentives, overtime, ojt, other, outsourcing, petty, projects, total, previous, prevOut, prevPetty, prevProjects, headCount, prevHeadCount, variance: total - previous, variancePct: previous ? ((total - previous) / previous) * 100 : 0 };
  });

  /** Required resources by outsourcing arrangement, by project and by team (a project's department). */
  readonly headCount = computed(() => {
    const arrangements = this.outsourcing().map((l) => ({ name: `${l.vendor} · ${l.category}`, prev: l.prevHC, proposed: l.hc }));
    const projects = this.projectsIncluded().filter((p) => p.headCount > 0).map((p) => ({ name: p.name, team: p.department ?? 'No department', proposed: p.headCount }));
    const teams = [...new Set(projects.map((p) => p.team))].map((t) => ({ name: t, proposed: projects.filter((p) => p.team === t).reduce((s, p) => s + p.proposed, 0) }));
    return { arrangements, projects, teams };
  });

  /** After the cut-off, normal users cannot add or change project requests of the departments the cycle applies to (BR-SUB-001/003). */
  projectsLocked(dept?: string): string {
    if (this.daysLeft() >= 0 || this.canManage()) return '';
    if (dept && !this.settings().departments.includes(dept)) return '';
    return `The cut-off date (${this.settings().cutOff}) has passed${dept ? ' for ' + dept : ''}. Project requests can no longer be added or changed; a cycle manager can reopen the budget.`;
  }

  // ---------- cut-off ----------
  readonly daysLeft = computed(() => Math.round((new Date(this.settings().cutOff + 'T12:00:00Z').getTime() - Date.now()) / 86400000));
  readonly phase = computed<'Not started' | 'Open' | 'Due soon' | 'Closed' | 'Submitted'>(() => {
    const s = this.status();
    if (s === 'Submitted' || s === 'Closed') return 'Submitted';
    if (s === 'Not Started') return 'Not started';
    if (this.daysLeft() < 0) return 'Closed';
    return this.daysLeft() <= 7 ? 'Due soon' : 'Open';
  });
  readonly canManage = computed(() => this.store.can('Manage Budget Cycle'));
  readonly canPrepare = computed(() => this.store.can('Prepare/Edit Draft Budget'));
  /** Editing is allowed while the cycle is open — after the cut-off only a cycle manager can still change it. */
  readonly editable = computed(() => ['Draft', 'Under Review', 'Ready for Submission', 'Reopened'].includes(this.status()) && (this.canPrepare() || this.canManage()) && (this.daysLeft() >= 0 || this.canManage()));

  // ---------- validation and completion ----------
  readonly issues = computed<Issue[]>(() => {
    const list: Issue[] = [];
    const err = (text: string) => list.push({ level: 'error', text });
    const warn = (text: string) => list.push({ level: 'warning', text });
    for (const l of this.outsourcing()) {
      if (!Number.isInteger(l.hc) || l.hc < 0 || l.monthlyHC.some((h) => !Number.isInteger(h) || h < 0)) err(`${l.category}: head count must be a whole number, zero or more.`);
      if ([l.salary, l.incentive, l.overtime, l.ojt, l.other].some((v) => !isFinite(v) || v < 0)) err(`${l.category}: amounts must be numbers that are not negative.`);
      if (l.hc > 0 && !(l.salary > 0)) err(`${l.category}: enter the monthly salary.`);
      const need = this.reasonNeeded(l);
      if (need && !l.reason.trim()) err(`${l.category}: add an adjustment reason — ${need}.`);
    }
    for (const l of this.petty()) {
      if (this.pettyFinal(l) < 0) err(`${l.category}: the final amount cannot be negative.`);
      if (l.adjustment !== 0 && !l.reason.trim()) err(`${l.category}: add a reason for the adjustment.`);
    }
    const drafts = this.projectsPending().filter((p) => p.status === 'Draft');
    if (drafts.length) err(`${drafts.length} project submission${drafts.length === 1 ? ' is' : 's are'} still a draft (${drafts.map((p) => p.name).join(', ')}). Submit or cancel ${drafts.length === 1 ? 'it' : 'them'}.`);
    const waiting = this.projectsPending().filter((p) => p.status !== 'Draft');
    if (waiting.length) warn(`${waiting.length} project${waiting.length === 1 ? '' : 's'} not decided yet (${waiting.map((p) => p.name).join(', ')}) — ${waiting.length === 1 ? 'it is' : 'they are'} not in the budget.`);
    if (!(this.totals().headCount > 0)) err('No head count has been entered.');
    if (this.totals().variancePct > this.settings().warnPct) warn(`The proposed budget is ${this.totals().variancePct.toFixed(1)}% above last year, over the ${this.settings().warnPct}% warning threshold.`);
    for (const p of this.projectsIncluded().filter((x) => x.projectStatus === 'Need Cancellation' && projectTotal(x) > 0)) warn(`"${p.name}" is marked for cancellation but has a positive cost.`);
    if (!this.settings().to.trim()) warn('No Budget Team recipient is configured, so the submission email would fail.');
    return list;
  });
  readonly errors = computed(() => this.issues().filter((i) => i.level === 'error'));

  readonly completion = computed(() => {
    const o = this.outsourcing();
    const checks = [
      o.every((l) => l.hc >= 0 && (l.hc === 0 || l.salary > 0)),
      o.every((l) => !this.reasonNeeded(l) || l.reason.trim()),
      this.petty().every((l) => l.adjustment === 0 || l.reason.trim()),
      this.projectsPending().every((p) => p.status !== 'Draft'),
      this.totals().headCount > 0,
      !!this.settings().to.trim(),
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  });

  /** Current-year petty cash against its allocation (BR-PC-005). */
  readonly pettyTracking = computed(() => {
    const line = this.store.budgetLines().find((l) => l.category === 'Petty Cash');
    const approved = line?.allocated ?? 0;
    const spent = line?.spent ?? 0;
    const elapsed = Math.max(1, new Date().getMonth() + 1);
    const forecast = Math.round((spent / elapsed) * 12);
    const util = approved ? Math.round((spent / approved) * 100) : 0;
    const flag = spent > approved ? 'Exceeded' : spent >= approved ? 'Reached' : forecast > approved ? 'Expected to exceed' : 'Within allocation';
    return { approved, spent, remaining: approved - spent, forecast, variance: forecast - approved, util, flag };
  });

  readonly nextYearTotal = computed(() => this.totals().total);

  // ---------- helpers ----------
  private lock = (): string | null => (this.editable() ? null : this.status() === 'Submitted' || this.status() === 'Closed' ? 'The budget is submitted and read-only. Reopen it first.' : this.daysLeft() < 0 ? 'The cut-off date has passed. A cycle manager must reopen the budget.' : 'You cannot edit the budget right now.');
  private touch() {
    if (this.status() === 'Ready for Submission') this.status.set('Under Review');
  }
  private log(action: string, ref: string, details: string, prev?: string, next?: string) {
    this.store.log(action, ref, details, 'Success', CURRENT_USER, { previousValue: prev, newValue: next });
  }

  // ---------- outsourcing ----------
  editOutsourcing(id: string, p: { hc: number; salary: number; incentive: number; overtime: number; ojt: number; other: number; reason: string; notes?: string }): string | null {
    const locked = this.lock();
    if (locked) return locked;
    const cur = this.outsourcing().find((l) => l.id === id);
    if (!cur) return 'Line not found.';
    const next: OutsourcingLine = { ...cur, ...p, monthlyHC: p.hc !== cur.hc ? flat(p.hc) : cur.monthlyHC, reason: p.reason.trim(), notes: (p.notes ?? cur.notes).trim() };
    if (!Number.isInteger(next.hc) || next.hc < 0) return 'Head count must be a whole number, zero or more.';
    if ([next.salary, next.incentive, next.overtime, next.ojt, next.other].some((v) => !isFinite(v) || v < 0)) return 'Amounts must be numbers that are not negative.';
    const need = this.reasonNeeded(next);
    if (need && !next.reason) return `Add an adjustment reason: ${need}.`;
    this.outsourcing.update((l) => l.map((x) => (x.id === id ? next : x)));
    this.touch();
    this.log('Budget Item Modified', `${next.vendor} · ${next.category}`, `Outsourcing line updated${next.reason ? ' — ' + next.reason : ''}.`, String(this.annual(cur)), String(this.annual(next)));
    return null;
  }

  setMonthlyHC(id: string, monthly: number[], reason: string): string | null {
    const locked = this.lock();
    if (locked) return locked;
    if (monthly.some((h) => !Number.isInteger(h) || h < 0)) return 'Each month needs a whole number of heads, zero or more.';
    const cur = this.outsourcing().find((l) => l.id === id);
    if (!cur) return 'Line not found.';
    const next = { ...cur, monthlyHC: monthly, hc: Math.max(...monthly), reason: reason.trim() || cur.reason };
    this.outsourcing.update((l) => l.map((x) => (x.id === id ? next : x)));
    this.touch();
    this.log('Head Count Changed', `${cur.vendor} · ${cur.category}`, `Monthly head count changed (${monthly.join(', ')}).`, cur.monthlyHC.join(','), monthly.join(','));
    return null;
  }

  addOutsourcing(v: { vendor: string; contract: string; category: string; hc: number; salary: number; incentive: number; overtime: number; ojt: number; reason: string; notes?: string }): string | null {
    const locked = this.lock();
    if (locked) return locked;
    if (!v.reason.trim()) return 'Add an adjustment reason: this is a new resource category.';
    if (!Number.isInteger(v.hc) || v.hc < 0) return 'Head count must be a whole number, zero or more.';
    const line: OutsourcingLine = { id: 'OUT-' + ++this.seq + 'N', vendor: v.vendor, contract: v.contract, category: v.category, prevHC: 0, hc: v.hc, monthlyHC: flat(v.hc), prevSalary: 0, salary: v.salary, prevIncentive: 0, incentive: v.incentive, prevOvertime: 0, overtime: v.overtime, prevOjt: 0, ojt: v.ojt, other: 0, notes: (v.notes ?? '').trim(), reason: v.reason.trim() };
    this.outsourcing.update((l) => [...l, line]);
    this.touch();
    this.log('Budget Item Added', `${v.vendor} · ${v.category}`, `New resource category: ${v.hc} head(s).`, undefined, String(this.annual(line)));
    return null;
  }

  removeOutsourcing(id: string) {
    const cur = this.outsourcing().find((l) => l.id === id);
    if (!cur || cur.prevHC > 0 || this.lock()) return;
    this.outsourcing.update((l) => l.filter((x) => x.id !== id));
    this.touch();
    this.log('Budget Item Removed', `${cur.vendor} · ${cur.category}`, 'New resource category removed.', String(this.annual(cur)));
  }

  /** BR-OUT-010: what hiring extra resources would cost. */
  calcResources(v: { count: number; fromMonth: number; salary: number; incentive: number; overtime: number; months: number; other: number }) {
    const months = Math.max(0, Math.min(v.months, 13 - v.fromMonth));
    const monthly = r3(v.count * v.salary);
    const remaining = Math.round(monthly * months + v.incentive + v.overtime + v.other);
    const current = this.totals().total;
    return { monthly, months, remaining, revised: current + remaining, current, difference: remaining };
  }

  addResources(id: string, v: { count: number; fromMonth: number; months: number; incentive: number; overtime: number; other: number; reason: string }): string | null {
    const locked = this.lock();
    if (locked) return locked;
    const cur = this.outsourcing().find((l) => l.id === id);
    if (!cur) return 'Line not found.';
    const monthly = cur.monthlyHC.map((h, i) => (i >= v.fromMonth - 1 && i < v.fromMonth - 1 + v.months ? h + v.count : h));
    const next = { ...cur, monthlyHC: monthly, hc: Math.max(...monthly), incentive: cur.incentive + v.incentive, overtime: cur.overtime + v.overtime, other: cur.other + v.other, reason: v.reason.trim() || cur.reason };
    this.outsourcing.update((l) => l.map((x) => (x.id === id ? next : x)));
    this.touch();
    this.log('Additional Resources Added', `${cur.vendor} · ${cur.category}`, `${v.count} additional resource(s) from ${MONTHS[v.fromMonth - 1]} for ${v.months} months.`, String(this.annual(cur)), String(this.annual(next)));
    return null;
  }

  /** The hiring scenario on the Cost & Petty Cash screen adds its cost to the first outsourcing line. */
  addOutsourcingExtra(amount: number, reason: string): string | null {
    const locked = this.lock();
    const first = this.outsourcing()[0];
    if (locked || !first) return locked ?? 'No outsourcing line.';
    const next = { ...first, other: first.other + amount, reason: reason };
    this.outsourcing.update((l) => l.map((x) => (x.id === first.id ? next : x)));
    this.touch();
    this.log('Budget Item Modified', `${first.vendor} · ${first.category}`, reason, String(this.annual(first)), String(this.annual(next)));
    return null;
  }

  // ---------- petty cash ----------
  setPettyFinal(id: string, final: number, reason: string): string | null {
    const locked = this.lock();
    if (locked) return locked;
    const cur = this.petty().find((l) => l.id === id);
    if (!cur) return 'Line not found.';
    if (!isFinite(final) || final < 0) return 'The amount must be a number that is not negative.';
    const adjustment = Math.round(final) - this.pettySystem(cur);
    if (adjustment !== 0 && !reason.trim()) return 'Add a reason for the adjustment.';
    this.petty.update((l) => l.map((x) => (x.id === id ? { ...x, adjustment, reason: adjustment === 0 ? '' : reason.trim(), monthly: undefined } : x)));
    this.touch();
    this.log('Budget Item Modified', `Petty cash · ${cur.category}`, adjustment === 0 ? 'Back to the system-proposed amount.' : `Adjusted by ${adjustment.toLocaleString()} OMR — ${reason.trim()}`, String(this.pettyFinal(cur)), String(Math.round(final)));
    return null;
  }

  /** BR-PC-004: the amount for each month; the annual amount becomes their total. */
  setPettyMonthly(id: string, months: number[], reason: string): string | null {
    const locked = this.lock();
    if (locked) return locked;
    const cur = this.petty().find((l) => l.id === id);
    if (!cur) return 'Line not found.';
    if (months.length !== 12 || months.some((v) => !isFinite(v) || v < 0)) return 'Each month needs an amount that is not negative.';
    const total = Math.round(months.reduce((s, v) => s + v, 0));
    const adjustment = total - this.pettySystem(cur);
    if (adjustment !== 0 && !reason.trim()) return 'Add a reason for the adjustment.';
    this.petty.update((l) => l.map((x) => (x.id === id ? { ...x, adjustment, reason: adjustment === 0 ? '' : reason.trim(), monthly: months.map((v) => Math.round(v)) } : x)));
    this.touch();
    this.log('Budget Item Modified', `Petty cash · ${cur.category}`, `Monthly amounts changed (${months.join(', ')}). Total ${total.toLocaleString()} OMR.`, String(this.pettyFinal(cur)), String(total));
    return null;
  }

  addPetty(category: string, prev: number, final: number, reason: string): string | null {
    const locked = this.lock();
    if (locked) return locked;
    if (!category.trim()) return 'Enter the expense category.';
    if (!isFinite(final) || final < 0) return 'The amount must be a number that is not negative.';
    if (!reason.trim()) return 'Add a reason: this is a new petty cash category.';
    const line: PettyLine = { id: 'PC-' + ++this.seq + 'N', category: category.trim(), prev, adjustment: 0, reason: reason.trim() };
    line.adjustment = Math.round(final) - this.pettySystem(line);
    this.petty.update((l) => [...l, line]);
    this.touch();
    this.log('Budget Item Added', `Petty cash · ${line.category}`, `New petty cash category: ${Math.round(final).toLocaleString()} OMR.`, undefined, String(Math.round(final)));
    return null;
  }

  // ---------- baseline and settings ----------
  /** Applies the annual increase to last year's values (BR-OUT-004): user adjustments are cleared. */
  applyBaseline(pct?: number) {
    if (pct !== undefined) this.settings.update((s) => ({ ...s, increasePct: pct }));
    this.resetToBaseline();
    this.touch();
    this.log('Increase Percentage Applied', this.settings().year, `Baseline recalculated with the ${this.settings().increasePct}% annual increase; adjustments cleared.`, undefined, String(this.settings().increasePct));
  }

  private resetToBaseline() {
    this.outsourcing.update((list) => list.filter((l) => l.prevHC > 0 || !l.id.endsWith('N')).map((l) => ({
      ...l, hc: l.prevHC, monthlyHC: flat(l.prevHC), salary: this.sysSalary(l.prevSalary), incentive: this.sys(l.prevIncentive), overtime: this.sys(l.prevOvertime), ojt: this.sys(l.prevOjt), other: 0, reason: '',
    })));
    this.petty.update((list) => list.filter((l) => !l.id.endsWith('N')).map((l) => ({ ...l, adjustment: 0, reason: '', monthly: undefined })));
  }

  constructor() {
    this.resetToBaseline();
  }

  saveSettings(s: Partial<CycleSettings>) {
    const before = this.settings();
    this.settings.update((x) => ({ ...x, ...s }));
    this.log('Budget Cycle Settings Changed', before.year, 'Cut-off, departments, increase percentage or recipients changed.', JSON.stringify({ cutOff: before.cutOff, pct: before.increasePct, to: before.to, departments: before.departments }), JSON.stringify({ cutOff: this.settings().cutOff, pct: this.settings().increasePct, to: this.settings().to, departments: this.settings().departments }));
  }

  // ---------- workflow ----------
  openCycle() {
    this.status.set('Draft');
    this.applyBaseline();
    this.log('Budget Created', this.settings().year, 'Budget cycle opened; last year\'s values copied and the annual increase applied.');
  }

  sendToReview() { this.setStatus('Under Review', 'Budget Sent for Review', 'Sent for internal review by the CRC team.'); }
  markReady(): string | null {
    if (this.errors().length) return 'Fix the validation errors first.';
    this.setStatus('Ready for Submission', 'Budget Ready for Submission', 'All required information is complete.');
    return null;
  }
  backToDraft() { this.setStatus('Draft', 'Budget Returned to Draft', 'Moved back to draft for changes.'); }

  private setStatus(s: CycleStatus, action: string, details: string) {
    const prev = this.status();
    this.status.set(s);
    this.log(action, this.settings().year, details, prev, s);
  }

  /** Submits the proposed budget: validates, locks it, records the version and "emails" the budget sheet. */
  submit(): { error?: string; submission?: Submission } {
    if (this.daysLeft() < 0 && !this.canManage()) return { error: 'The cut-off date has passed. A cycle manager must reopen the budget.' };
    if (this.errors().length) return { error: 'Fix the validation errors before submitting.' };
    const version = this.submissions().length + 1;
    const year = this.settings().year;
    const ref = `BUD-${year}-${String(version).padStart(3, '0')}`;
    const to = this.settings().to.trim();
    const sub: Submission = {
      version, reference: ref, at: new Date().toISOString(), by: CURRENT_USER, total: this.totals().total, fileName: `CRC-Budget-${year}-v${version}.xlsx`,
      recipients: [this.settings().to, this.settings().cc && 'CC: ' + this.settings().cc].filter(Boolean).join(' · '),
      emailStatus: to ? 'Sent' : 'Failed', emailError: to ? undefined : 'No Budget Team recipient is configured.',
    };
    this.submissions.update((l) => [sub, ...l]);
    this.status.set('Submitted');
    this.log('Budget Submitted', ref, `${sub.total.toLocaleString()} OMR submitted (version ${version}).`, 'Ready for Submission', 'Submitted');
    this.log('Budget Sheet Generated', ref, sub.fileName);
    if (sub.emailStatus === 'Sent') {
      this.log('Budget Email Sent', ref, `Sent to ${sub.recipients}.`);
      this.store.notify(`Budget ${ref} submitted and emailed to the Budget Team.`, 'Budget', 'green', '/contracts-budget/budget-preparation');
    } else {
      this.store.log('Budget Email Failed', ref, sub.emailError!, 'Failed', CURRENT_USER);
      this.store.notify(`Budget ${ref} was submitted but the email failed.`, 'Budget', 'red', '/contracts-budget/budget-preparation');
    }
    return { submission: sub };
  }

  resendEmail(ref: string): string | null {
    const sub = this.submissions().find((s) => s.reference === ref);
    if (!sub) return 'Submission not found.';
    if (!this.settings().to.trim()) {
      this.store.log('Budget Email Failed', ref, 'No Budget Team recipient is configured.', 'Failed', CURRENT_USER);
      return 'No Budget Team recipient is configured. Add one in the cycle settings, then resend.';
    }
    this.submissions.update((l) => l.map((s) => (s.reference === ref ? { ...s, emailStatus: 'Sent', emailError: undefined, recipients: [this.settings().to, this.settings().cc && 'CC: ' + this.settings().cc].filter(Boolean).join(' · ') } : s)));
    this.log('Budget Email Resent', ref, 'The budget sheet was sent again — no new submission was created.');
    this.store.notify(`Budget ${ref} was emailed to the Budget Team.`, 'Budget', 'green', '/contracts-budget/budget-preparation');
    return null;
  }

  reopen(reason: string) {
    this.reopenLog.update((l) => [{ at: new Date().toISOString(), by: CURRENT_USER, reason }, ...l]);
    this.setStatus('Reopened', 'Budget Reopened', reason);
  }

  close() { this.setStatus('Closed', 'Budget Cycle Closed', 'The budget cycle was closed; no further changes are permitted.'); }

  // ---------- the budget sheet ----------
  sheet() {
    const t = this.totals();
    const s = this.settings();
    const last = this.submissions()[0];
    const summary = [
      ['Financial year', s.year], ['Budget cycle', s.cycleName], ['Applicable departments', s.departments.join(', ')], ['Budget cycle status', this.status()], ['Submission date', last ? last.at.slice(0, 10) : 'Not submitted yet'], ['Business unit', 'Customer Care (CRC)'],
      ['Applied increase %', s.increasePct], ['Total budget (OMR)', t.total], ['Outsourcing (OMR)', t.outsourcing], ['  Salaries (OMR)', t.salaries], ['  Incentives (OMR)', t.incentives], ['  Overtime (OMR)', t.overtime], ['  OJT (OMR)', t.ojt],
      ['  Other (OMR)', t.other], ['Petty cash (OMR)', t.petty], ['Projects (OMR)', t.projects], ['Head-count-related costs (OMR)', t.salaries], ['Previous-year budget (OMR)', t.previous], ['Variance (OMR)', t.variance],
      ['Variance %', Math.round(t.variancePct * 10) / 10], ['Total proposed head count', t.headCount], ['Submission status', this.status()],
    ].map(([Item, Value]) => ({ Item, Value }));
    const outsourcing = this.outsourcing().map((l) => ({
      Vendor: l.vendor, Contract: l.contract, 'Resource category': l.category, 'Previous head count': l.prevHC, 'Proposed head count': l.hc, 'Previous monthly salary': l.prevSalary, 'Proposed monthly salary': l.salary,
      'Previous-year amount': this.prevAnnual(l), 'Increase %': s.increasePct, 'System-calculated amount': this.systemAnnual(l), 'User-adjusted amount': this.annual(l) - this.systemAnnual(l), 'Final proposed amount': this.annual(l),
      'Variance from previous year': this.annual(l) - this.prevAnnual(l), Incentive: l.incentive, Overtime: l.overtime, OJT: l.ojt, 'Adjustment reason': l.reason, 'Notes / assumptions': l.notes,
    }));
    const petty = this.petty().map((l) => ({ Category: l.category, ...Object.fromEntries(MONTHS.map((m, i) => [m, this.pettyMonths(l)[i]])), 'Previous-year amount': l.prev, 'Increase %': s.increasePct, 'System-calculated amount': this.pettySystem(l), 'User-adjusted amount': l.adjustment, 'Final proposed amount': this.pettyFinal(l), 'Variance from previous year': this.pettyFinal(l) - l.prev, 'Monthly amount': Math.round(this.pettyFinal(l) / 12), 'Adjustment reason': l.reason }));
    const projects = this.projectsIncluded().map((p) => ({ Reference: p.reference ?? '', Project: p.name, Department: p.department ?? '', 'Project status': p.projectStatus, Priority: p.priority, Currency: p.currency, 'Estimated cost': p.budget, 'Resource cost': resourceCost(p), 'Total (OMR)': projectTotal(p), 'Head count': p.headCount, Justification: p.reason, 'Submission status': p.status }));
    const hc = this.headCount();
    const headCount = [
      ...hc.arrangements.map((r) => ({ Group: 'Outsourcing arrangement', Name: r.name, 'Previous head count': r.prev, 'Proposed head count': r.proposed })),
      ...hc.projects.map((r) => ({ Group: 'Project', Name: r.name, 'Previous head count': 0, 'Proposed head count': r.proposed })),
      ...hc.teams.map((r) => ({ Group: 'Team (project department)', Name: r.name, 'Previous head count': 0, 'Proposed head count': r.proposed })),
    ];
    return { summary, outsourcing, petty, projects, headCount };
  }

  /** Text lines for the PDF version of the budget sheet. */
  sheetLines(): string[] {
    const sh = this.sheet();
    return [
      ...sh.summary.map((r) => `${r.Item}: ${typeof r.Value === 'number' ? r.Value.toLocaleString('en-GB') : r.Value}`),
      '', 'Outsourcing', ...sh.outsourcing.map((r) => `${r['Resource category']}: HC ${r['Proposed head count']}, ${Number(r['Final proposed amount']).toLocaleString('en-GB')} OMR (was ${Number(r['Previous-year amount']).toLocaleString('en-GB')})`),
      '', 'Petty cash', ...sh.petty.map((r) => `${r.Category}: ${Number(r['Final proposed amount']).toLocaleString('en-GB')} OMR`),
      '', 'Projects', ...sh.projects.map((r) => `${r.Project} (${r['Project status']}, ${r.Priority}): ${Number(r['Total (OMR)']).toLocaleString('en-GB')} OMR`),
    ];
  }

  includedProjects(): ProjectRequest[] { return this.projectsIncluded(); }
}
