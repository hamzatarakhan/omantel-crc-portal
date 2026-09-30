import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { BaseChartDirective } from 'ng2-charts';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { ChartCardComponent } from '../../../shared/components/chart-card/chart-card.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { ForecastService, AccrualRow } from '../../../core/services/forecast.service';
import { Contract } from '../../../core/models/domain';
import { StatusLevel } from '../../../core/models/status';
import { expiryCountdown, statusLevelFor } from '../../../core/services/contract-monitoring';

const FIELD = 'w-full px-2.5 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 focus:outline-none focus:border-brand-400';
const LEVEL_COLOR: Record<StatusLevel, string> = { normal: '#0e9f6e', amber: '#e3a008', orange: '#ea6e00', red: '#e02424', info: '#2d13ea', neutral: '#8589a3' };
/** Agents are recorded against a short vendor keyword; a contract's vendor name starts with it when the two are the same outsourcing vendor. Contracts outside these three have no workforce tracked against them. */
const AGENT_VENDORS = ['Infoline', 'Green Umbrella', 'OJT'] as const;
const EXPIRY_BUCKETS = ['All', 'Next 30 days', 'Next 60 days', 'Next 90 days', 'Expired'] as const;
const clamp = (n: number) => Math.min(100, Math.max(0, n));

/** A half-circle "gauge" doughnut: one slice for the value, one for the rest, drawn as a semicircle. Rounded caps and a gap between the two arcs give it a more modern, pill-like look. */
const halfGauge = (pct: number, color: string) => ({
  data: { labels: ['Value', 'Rest'], datasets: [{ data: [clamp(pct), 100 - clamp(pct)], backgroundColor: [color, '#EDEBFB'], borderWidth: 0, borderRadius: 8, spacing: 3 }] },
  options: { responsive: true, maintainAspectRatio: false, rotation: -90, circumference: 180, cutout: '76%', plugins: { legend: { display: false }, tooltip: { enabled: false } } },
});
/** A full-circle ring gauge, for the two gender indicators. */
const ringGauge = (pct: number, color: string) => ({
  data: { labels: ['Value', 'Rest'], datasets: [{ data: [clamp(pct), 100 - clamp(pct)], backgroundColor: [color, '#EDEBFB'], borderWidth: 0, borderRadius: 8, spacing: 3 }] },
  options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false }, tooltip: { enabled: false } } },
});

/** One contract's financial and workforce picture, for the top management overview. */
@Component({
  selector: 'app-general-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, BaseChartDirective, PageHeaderComponent, KpiCardComponent, ChartCardComponent],
  template: `
    <app-page-header title="General Dashboard" subtitle="Budget, spend, forecast and workforce for one contract at a time"></app-page-header>

    <!-- filters -->
    <div class="surface-card px-4 py-3.5 mb-5">
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        <label class="block xl:col-span-2"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Contract</span>
          <select [class]="field + ' mt-1'" (change)="contractRef.set($any($event.target).value)">
            @for (c of contractOptions(); track c.reference) { <option [value]="c.reference" [selected]="c.reference === contractRef()">{{ c.reference }} &middot; {{ c.name }}</option> }
            @empty { <option value="">No contract matches these filters</option> }
          </select></label>
        <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Department</span>
          <select [class]="field + ' mt-1'" (change)="department.set($any($event.target).value)">
            <option value="All" [selected]="department() === 'All'">All departments</option>
            @for (d of departments(); track d) { <option [value]="d" [selected]="d === department()">{{ d }}</option> }
          </select></label>
        <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Status</span>
          <select [class]="field + ' mt-1'" (change)="status.set($any($event.target).value)">
            <option value="All" [selected]="status() === 'All'">All statuses</option>
            @for (s of statuses; track s) { <option [value]="s" [selected]="s === status()">{{ s }}</option> }
          </select></label>
        <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Contract type</span>
          <select [class]="field + ' mt-1'" (change)="type.set($any($event.target).value)">
            <option value="All" [selected]="type() === 'All'">All types</option>
            @for (t of types(); track t) { <option [value]="t" [selected]="t === type()">{{ t }}</option> }
          </select></label>
        <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Expiry period</span>
          <select [class]="field + ' mt-1'" (change)="expiryBucket.set($any($event.target).value)">
            @for (b of expiryBuckets; track b) { <option [value]="b" [selected]="b === expiryBucket()">{{ b }}</option> }
          </select></label>
        <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Starts from</span>
          <input type="date" [class]="field + ' mt-1'" [value]="from()" (change)="from.set($any($event.target).value)" /></label>
        <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Ends by</span>
          <input type="date" [class]="field + ' mt-1'" [value]="to()" (change)="to.set($any($event.target).value)" /></label>
      </div>
      <div class="flex justify-end mt-2.5"><button type="button" (click)="resetFilters()" class="text-xs font-semibold text-brand-700 hover:underline">Reset filters</button></div>
    </div>

    @if (selectedContract(); as c) {
      <div class="surface-card px-5 py-4 mb-4 flex items-start justify-between flex-wrap gap-3">
        <div class="flex items-start gap-3 min-w-0">
          <div class="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><mat-icon>description</mat-icon></div>
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap"><span class="font-bold text-ink-900 text-[15px]">{{ c.name }}</span><span class="status-chip !text-[10px] !px-2 !py-0.5" [class]="'status-chip--' + statusLevelFor(c)">{{ c.status }}</span></div>
            <div class="text-xs text-ink-500 mt-0.5">{{ c.vendorName }} &middot; {{ c.reference }} &middot; {{ c.contractType }}{{ c.department ? ' &middot; ' + c.department : '' }}</div>
          </div>
        </div>
        <div class="text-xs text-ink-500 text-right shrink-0">Contract duration<div class="font-semibold text-ink-900">{{ c.startDate | date:'d MMM y' }} &rarr; {{ c.endDate | date:'d MMM y' }}</div></div>
      </div>

      <!-- Row 1: financial KPIs -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <app-kpi-card label="Budget" [value]="budget(c) | number:'1.0-0'" unit="OMR" icon="account_balance_wallet"></app-kpi-card>
        <app-kpi-card label="Consumed" [value]="consumed(c) | number:'1.0-0'" unit="OMR" icon="trending_down"></app-kpi-card>
        <app-kpi-card label="Forecast" [value]="forecastTotal(c) | number:'1.0-0'" unit="OMR" icon="query_stats"></app-kpi-card>
        <app-kpi-card label="Savings" [value]="savings(c) | number:'1.0-0'" unit="OMR" [trend]="(savingsPct(c) | number:'1.0-0') + '%'" [trendPositive]="savings(c) >= 0" [level]="savings(c) < 0 ? 'red' : 'normal'" icon="savings"></app-kpi-card>
      </div>

      <!-- Row 2: utilization donut + expiry gauge -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 items-start">
        <div class="surface-card px-5 py-4">
          <h3 class="text-[13.5px] font-bold text-ink-900">Budget Utilization</h3>
          <div class="min-h-[116px] flex items-center mt-3">
            <div class="flex items-center gap-5">
              <div class="relative w-[116px] h-[116px] shrink-0"><canvas baseChart [data]="utilizationChart(c).data" type="doughnut" [options]="utilizationChart(c).options"></canvas>
                <div class="absolute inset-0 flex flex-col items-center justify-center">
                  <div class="text-xl font-extrabold text-ink-900">{{ usedPct(c) | number:'1.0-0' }}%</div>
                  <div class="text-[10px] text-ink-400 uppercase tracking-wide">Consumed</div>
                  <div class="text-[10px] font-semibold mt-0.5" [style.color]="utilizationStatus(c).color">{{ utilizationStatus(c).label }}</div>
                </div>
              </div>
              <div class="text-sm">
                <div class="flex items-center gap-2 mb-2"><span class="w-2.5 h-2.5 rounded-full shrink-0" [style.background]="utilizationStatus(c).color"></span>Consumed: <b class="text-ink-900">{{ consumed(c) | number:'1.0-0' }} OMR</b></div>
                <div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-[#EDEBFB] border border-surface-border shrink-0"></span>Remaining: <b class="text-ink-900">{{ (budget(c) - consumed(c)) | number:'1.0-0' }} OMR</b></div>
              </div>
            </div>
          </div>
        </div>

        <div class="surface-card px-5 py-4">
          <h3 class="text-[13.5px] font-bold text-ink-900">Contract Expiry</h3>
          <div class="min-h-[116px] flex items-center gap-5 mt-3">
            <div class="relative w-[116px] h-[90px] shrink-0"><canvas baseChart [data]="expiryChart(c).data" type="doughnut" [options]="expiryChart(c).options"></canvas>
              <div class="absolute inset-x-0 bottom-1.5 text-center"><div class="text-xl font-extrabold" [style.color]="levelColor(c)">{{ c.daysRemaining < 0 ? 0 : c.daysRemaining }}</div><div class="text-[10px] text-ink-400 uppercase tracking-wide">Days remaining</div></div>
            </div>
            <div class="text-sm">
              <div class="mb-2 font-medium text-ink-700">{{ expiryCountdown(c.endDate) }}</div>
              <div class="text-ink-500">Start: <b class="text-ink-900">{{ c.startDate | date:'d MMM y' }}</b></div>
              <div class="text-ink-500">Expiry: <b class="text-ink-900">{{ c.endDate | date:'d MMM y' }}</b></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Row 3: budget & forecast trend -->
      <div class="h-72 mb-4"><app-chart-card title="Budget & Forecast Trend" subtitle="Cumulative actual spend vs. forecast, against the approved budget" type="line" [data]="trendChart(c)" [options]="trendOptions"></app-chart-card></div>

      <!-- Row 4: headcount + gender -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <!-- Wrapped in a plain div (app-kpi-card's own host is display:contents) so its internal h-full resolves
             against this div's own auto height instead of stretching to match the taller sibling card. -->
        <div><app-kpi-card label="Team Headcount" [value]="headcount(c)" unit="employees" icon="groups"></app-kpi-card></div>

        <div class="surface-card px-5 py-4">
          <h3 class="text-[13.5px] font-bold text-ink-900">Team Gender Distribution</h3>
          <div class="min-h-[116px] flex items-center mt-3">
            <div class="flex items-center gap-5">
              <div class="relative w-[116px] h-[116px] shrink-0"><canvas baseChart [data]="genderChart(c).data" type="doughnut" [options]="genderChart(c).options"></canvas>
                <div class="absolute inset-0 flex flex-col items-center justify-center"><div class="text-xl font-extrabold text-ink-900">{{ genderStats(c).total }}</div><div class="text-[10px] text-ink-400 uppercase tracking-wide">Employees</div></div>
              </div>
              <div class="text-sm">
                <div class="flex items-center gap-2 mb-2"><span class="w-2.5 h-2.5 rounded-full bg-[#ea6e00] shrink-0"></span>Female: <b class="text-ink-900">{{ genderStats(c).female }}</b> <span class="text-ink-400">({{ genderStats(c).femalePct | number:'1.0-0' }}%)</span></div>
                <div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-[#2d13ea] shrink-0"></span>Male: <b class="text-ink-900">{{ genderStats(c).male }}</b> <span class="text-ink-400">({{ genderStats(c).malePct | number:'1.0-0' }}%)</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    } @else {
      <div class="surface-card p-10 text-center text-sm text-ink-500">No contract matches these filters — try Reset filters.</div>
    }
  `,
})
export class GeneralDashboardComponent {
  store = inject(CrcStore);
  private forecast = inject(ForecastService);

  /** Wide month range means dozens of x-axis labels — thin them out instead of letting them overlap. */
  readonly trendOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' as const, labels: { boxWidth: 10, font: { size: 11 } } } },
    scales: { x: { ticks: { autoSkip: true, maxRotation: 0, maxTicksLimit: 8 } }, y: { ticks: { callback: (v: number | string) => Number(v).toLocaleString('en-GB') } } },
  };

  readonly field = FIELD;
  readonly statuses = ['Active', 'Expiring Soon', 'Expired'];
  readonly expiryBuckets = EXPIRY_BUCKETS;
  expiryCountdown = expiryCountdown;
  statusLevelFor = statusLevelFor;

  department = signal('All');
  status = signal('All');
  type = signal('All');
  expiryBucket = signal<(typeof EXPIRY_BUCKETS)[number]>('All');
  from = signal('');
  to = signal('');
  contractRef = signal('');

  private allContracts = computed(() => this.store.contracts().filter((c) => c.status !== 'Cancelled'));
  departments = computed(() => [...new Set(this.allContracts().map((c) => c.department).filter((d): d is string => !!d))].sort());
  types = computed(() => [...new Set(this.allContracts().map((c) => c.contractType))].sort());

  private inExpiryBucket(c: Contract): boolean {
    const b = this.expiryBucket();
    if (b === 'All') return true;
    if (b === 'Expired') return c.daysRemaining < 0;
    const days = b === 'Next 30 days' ? 30 : b === 'Next 60 days' ? 60 : 90;
    return c.daysRemaining >= 0 && c.daysRemaining <= days;
  }

  /** Every contract matching the non-contract filters — the pool the Contract picker itself draws from. */
  contractOptions = computed(() => this.allContracts().filter((c) =>
    (this.department() === 'All' || c.department === this.department()) &&
    (this.status() === 'All' || c.status === this.status()) &&
    (this.type() === 'All' || c.contractType === this.type()) &&
    this.inExpiryBucket(c) &&
    (!this.from() || c.startDate >= this.from()) &&
    (!this.to() || c.endDate <= this.to())));

  /** Falls back to the first contract left in the narrowed list when the picked one is filtered out, instead of showing an empty state unnecessarily. */
  selectedContract = computed(() => { const opts = this.contractOptions(); return opts.find((c) => c.reference === this.contractRef()) ?? opts[0] ?? null; });

  constructor() {
    this.contractRef.set(this.defaultContractRef());
  }

  private defaultContractRef(): string {
    const active = [...this.store.contracts()].filter((c) => c.status === 'Active').sort((a, b) => a.daysRemaining - b.daysRemaining);
    return (active[0] ?? this.store.contracts()[0])?.reference ?? '';
  }

  resetFilters() {
    this.department.set('All'); this.status.set('All'); this.type.set('All'); this.expiryBucket.set('All'); this.from.set(''); this.to.set('');
    this.contractRef.set(this.defaultContractRef());
  }

  // ---------- workforce ----------
  private agentVendorKey(c: Contract) {
    return AGENT_VENDORS.find((k) => c.vendorName.startsWith(k));
  }
  /** True only for the contracts whose workforce and spend actually route through WFO/the forecast engine (today: the Infoline and Green Umbrella secondment contracts). Every other contract shows a deterministic demo figure instead, seeded from its own reference, so the dashboard is always fully populated. */
  private tracked(c: Contract): boolean {
    return !!this.agentVendorKey(c) && this.forecast.accrualRows().some((r) => r.contract.reference === c.reference);
  }
  private agentsOf(c: Contract) {
    const key = this.agentVendorKey(c);
    return key ? this.store.agents().filter((a) => a.vendor === key) : [];
  }
  /** A stable per-contract seed, so a given contract's demo figures never change between renders or reloads. */
  private demoSeed(c: Contract): number {
    let h = 0;
    for (const ch of c.reference) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return Math.abs(h);
  }
  headcount(c: Contract): number {
    if (this.tracked(c)) return this.agentsOf(c).length;
    return 8 + (this.demoSeed(c) % 55);
  }
  genderStats(c: Contract) {
    if (this.tracked(c)) {
      const agents = this.agentsOf(c), total = agents.length;
      const female = agents.filter((a) => a.gender === 'Female').length, male = total - female;
      return { total, female, male, femalePct: total ? (female / total) * 100 : 0, malePct: total ? (male / total) * 100 : 0 };
    }
    const total = this.headcount(c), femalePct = 30 + ((this.demoSeed(c) >> 6) % 40);
    const female = Math.round((total * femalePct) / 100), male = total - female;
    return { total, female, male, femalePct: total ? (female / total) * 100 : 0, malePct: total ? (male / total) * 100 : 0 };
  }

  // ---------- financials ----------
  budget(c: Contract): number {
    return c.amount;
  }
  private contractRows(c: Contract): AccrualRow[] {
    return this.forecast.accrualRows().filter((r) => r.contract.reference === c.reference);
  }
  consumed(c: Contract): number {
    if (!this.tracked(c)) return this.budget(c) * ((40 + (this.demoSeed(c) % 45)) / 100);
    const acts = this.forecast.actuals();
    return [...new Set(this.contractRows(c).map((r) => r.key))].reduce((t, k) => t + Object.values(acts[k] ?? {}).reduce((a, b) => a + b, 0), 0);
  }
  forecastTotal(c: Contract): number {
    if (!this.tracked(c)) return this.budget(c) * (0.85 + ((this.demoSeed(c) >> 3) % 30) / 100);
    return this.contractRows(c).reduce((s, r) => s + (this.forecast.pace(r).projected ?? r.budget), 0);
  }
  savings(c: Contract): number {
    return this.budget(c) - this.forecastTotal(c);
  }
  savingsPct(c: Contract): number {
    const b = this.budget(c); return b ? (this.savings(c) / b) * 100 : 0;
  }
  usedPct(c: Contract): number {
    const b = this.budget(c); return b ? Math.min(100, (this.consumed(c) / b) * 100) : 0;
  }

  levelColor(c: Contract): string {
    return LEVEL_COLOR[statusLevelFor(c)];
  }

  // ---------- charts ----------
  /** Colors the remaining share, not the consumed share, so the arc and the centered "Remaining %" text agree. */
  /** Budget-utilization status, per the SRS's health bands: comfortably under budget, approaching it, or over. */
  utilizationStatus(c: Contract): { color: string; label: string } {
    const pct = this.usedPct(c);
    if (pct >= 100) return { color: LEVEL_COLOR.red, label: 'Over budget' };
    if (pct >= 80) return { color: LEVEL_COLOR.amber, label: 'Near limit' };
    return { color: LEVEL_COLOR.normal, label: 'On track' };
  }
  utilizationChart(c: Contract) { return ringGauge(this.usedPct(c), this.utilizationStatus(c).color); }
  expiryChart(c: Contract) {
    const total = Math.max(1, (+new Date(c.endDate) - +new Date(c.startDate)));
    const remainingPct = clamp(((+new Date(c.endDate) - Date.now()) / total) * 100);
    return halfGauge(remainingPct, this.levelColor(c));
  }
  /** A single Female/Male donut — one clear 100% split instead of two separate gauges repeating the same two numbers. */
  genderChart(c: Contract) {
    const { female, male } = this.genderStats(c);
    return {
      data: { labels: ['Female', 'Male'], datasets: [{ data: [female, male], backgroundColor: ['#ea6e00', '#2d13ea'], borderWidth: 0, borderRadius: 8, spacing: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false }, tooltip: { enabled: false } } },
    };
  }

  trendChart(c: Contract) {
    if (!this.tracked(c)) return this.demoTrendChart(c);
    const rows = this.contractRows(c);
    const monthIsos = [...new Set(rows.flatMap((r) => this.forecast.monthsOf(r)))].sort();
    const actualLine: Array<number | null> = [], forecastLine: Array<number | null> = [];
    let cum = 0, lastActualIdx = -1;
    monthIsos.forEach((iso, i) => {
      let monthActual: number | null = null, monthForecast: number | null = null;
      for (const r of rows) {
        if (!this.forecast.monthsOf(r).includes(iso)) continue;
        const cell = this.forecast.cell(r, iso);
        if (cell.actual) monthActual = (monthActual ?? 0) + (cell.value ?? 0);
        else if (cell.forecast !== null) monthForecast = (monthForecast ?? 0) + cell.forecast;
      }
      cum += monthActual ?? monthForecast ?? 0;
      if (monthActual !== null) { actualLine.push(cum); forecastLine.push(null); lastActualIdx = i; }
      else { actualLine.push(null); forecastLine.push(cum); }
    });
    if (lastActualIdx >= 0 && lastActualIdx < forecastLine.length - 1) forecastLine[lastActualIdx] = actualLine[lastActualIdx];
    const budgetTotal = this.budget(c);
    return {
      labels: monthIsos.map((iso) => this.forecast.monthLabel(iso).replace(' 20', ' ’')),
      datasets: [
        { label: 'Budget', data: monthIsos.map(() => budgetTotal), borderColor: '#0e9f6e', borderDash: [6, 4], pointRadius: 0, borderWidth: 2 },
        { label: 'Actual', data: actualLine, borderColor: '#2d13ea', backgroundColor: '#2d13ea', tension: 0.3, pointRadius: 2 },
        { label: 'Forecast', data: forecastLine, borderColor: '#ea6e00', backgroundColor: '#ea6e00', borderDash: [4, 3], tension: 0.3, pointRadius: 2 },
      ],
    };
  }

  /** A plausible cumulative spend line for a contract with no real WFO/forecast link: ramps up to the (seeded) consumed total by "now", then on to the forecast total by the contract's end date. */
  private demoTrendChart(c: Contract) {
    const months = this.monthRange(c.startDate, c.endDate);
    const consumedTotal = this.consumed(c), forecastAmt = this.forecastTotal(c), budgetTotal = this.budget(c);
    const todayIso = new Date().toISOString().slice(0, 7);
    let splitIdx = months.findIndex((m) => m >= todayIso);
    if (splitIdx === -1) splitIdx = months.length - 1;
    const actualLine: Array<number | null> = [], forecastLine: Array<number | null> = [];
    months.forEach((m, i) => {
      if (i <= splitIdx) {
        actualLine.push(splitIdx > 0 ? consumedTotal * (i / splitIdx) : consumedTotal);
        forecastLine.push(i === splitIdx ? actualLine[i] : null);
      } else {
        actualLine.push(null);
        const span = Math.max(1, months.length - 1 - splitIdx);
        forecastLine.push(consumedTotal + (forecastAmt - consumedTotal) * ((i - splitIdx) / span));
      }
    });
    return {
      labels: months.map((m) => this.monthLabel(m)),
      datasets: [
        { label: 'Budget', data: months.map(() => budgetTotal), borderColor: '#0e9f6e', borderDash: [6, 4], pointRadius: 0, borderWidth: 2 },
        { label: 'Actual', data: actualLine, borderColor: '#2d13ea', backgroundColor: '#2d13ea', tension: 0.3, pointRadius: 2 },
        { label: 'Forecast', data: forecastLine, borderColor: '#ea6e00', backgroundColor: '#ea6e00', borderDash: [4, 3], tension: 0.3, pointRadius: 2 },
      ],
    };
  }

  private monthRange(startIso: string, endIso: string): string[] {
    const out: string[] = [];
    let [y, m] = startIso.slice(0, 7).split('-').map(Number);
    const [ey, em] = endIso.slice(0, 7).split('-').map(Number);
    while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
    return out;
  }

  private monthLabel(iso: string): string {
    const [y, m] = iso.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' }).replace(' 20', ' ’');
  }
}
