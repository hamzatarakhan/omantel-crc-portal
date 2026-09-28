import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CrcStore, SERVICE_CLASSES, ServiceClass } from '../../../core/services/crc-store.service';
import { ForecastService } from '../../../core/services/forecast.service';
import { ProjectRequests } from '../../../core/services/project-requests.service';
import { fx } from '../../../core/services/project-data';
import { Contract } from '../../../core/models/domain';

const ALERT_MONTHS = 7;
const today = () => new Date().toISOString().slice(0, 10);
const addMonths = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
/** Projects already alerted this session, so opening the page twice does not notify twice. */
const alerted = new Set<string>();

interface ContractSummary {
  contract: Contract;
  budget: number; expense: number; remaining: number; savings: number; savingsPct: number; usedPct: number; ended: boolean;
  months: Array<{ iso: string; label: string; invoiced: number | null; forecast: number | null; headcount: number | null }>;
  headcount: number | null;
}

/** Top management's overview: secondment and managed-services contracts, and the active projects with their 7-month end alerts. */
@Component({
  selector: 'app-general-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, PageHeaderComponent],
  template: `
    <app-page-header title="General Dashboard" subtitle="Budget, expense and savings for secondment and managed services, and the active projects"></app-page-header>

    @if (alerts().length) {
      <div class="rounded-xl border border-solid border-amber-200 bg-amber-50 px-4 py-3 mb-5">
        <div class="flex items-center gap-2 text-sm font-bold text-status-amber"><mat-icon class="!text-lg">notifications_active</mat-icon>{{ alerts().length }} project{{ alerts().length === 1 ? '' : 's' }} end within {{ alertMonths }} months — plan the renewal or closure</div>
        <ul class="mt-1.5 text-xs text-ink-700 space-y-0.5">
          @for (p of alerts(); track p.id) { <li><b>{{ p.name }}</b> (PO {{ p.po }}) ends {{ p.end | date:'d MMM y' }} — {{ p.left }}</li> }
        </ul>
      </div>
    }

    <!-- A) Secondment -->
    <h2 class="text-[15px] font-bold text-ink-900 mb-2 flex items-center gap-2"><mat-icon class="!text-lg text-brand-600">badge</mat-icon>Secondment</h2>
    @for (s of secondment(); track s.contract.reference) {
      <div class="surface-card p-4 mb-5">
        <div class="flex items-start justify-between flex-wrap gap-2 mb-3">
          <div>
            <div class="flex items-center gap-2"><span class="font-bold text-ink-900">{{ s.contract.name }}</span><span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">Secondment</span></div>
            <div class="text-xs text-ink-500 mt-0.5">{{ s.contract.vendorName }} · {{ s.contract.reference }} · PO {{ s.contract.poNumber }}</div>
            <div class="flex flex-wrap gap-1.5 mt-2">@for (i of secondmentItems; track i) { <span class="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-surface-subtle text-ink-700">{{ i }}</span> }</div>
          </div>
          <div class="text-xs text-ink-500 text-right">Contract duration<div class="font-semibold text-ink-900">{{ s.contract.startDate | date:'d MMM y' }} &rarr; {{ s.contract.endDate | date:'d MMM y' }}</div></div>
        </div>
        <ng-container *ngTemplateOutlet="tiles; context: { $implicit: s }"></ng-container>
        <div class="mt-4">
          <div class="text-xs font-bold text-ink-500 uppercase tracking-wide mb-1.5">Monthly summary</div>
          <div class="overflow-x-auto max-h-72 overflow-y-auto rounded-lg border border-surface-border">
            <table class="w-full text-sm">
              <thead class="sticky top-0"><tr class="bg-surface-subtle text-left text-xs text-ink-500"><th class="px-3 py-2 font-medium">Month</th><th class="px-3 py-2 font-medium text-right">Invoiced (OMR)</th><th class="px-3 py-2 font-medium text-right">Forecast (OMR)</th><th class="px-3 py-2 font-medium text-right">Headcount</th></tr></thead>
              <tbody>
                @for (m of s.months; track m.iso) {
                  <tr class="border-t border-surface-border">
                    <td class="px-3 py-1.5 text-ink-800">{{ m.label }}</td>
                    <td class="px-3 py-1.5 text-right tabular-nums">{{ m.invoiced === null ? '—' : (m.invoiced | number:'1.0-0') }}</td>
                    <td class="px-3 py-1.5 text-right tabular-nums text-ink-600">{{ m.forecast === null ? '—' : (m.forecast | number:'1.0-0') }}</td>
                    <td class="px-3 py-1.5 text-right tabular-nums">{{ m.headcount === null ? '—' : m.headcount }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    } @empty { <div class="surface-card p-5 mb-5 text-sm text-ink-500">No contract is marked as Secondment yet. Mark one under Contract classification below.</div> }

    <!-- B) Managed services -->
    <h2 class="text-[15px] font-bold text-ink-900 mb-2 flex items-center gap-2"><mat-icon class="!text-lg text-brand-600">support_agent</mat-icon>Managed Services</h2>
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-5">
      @for (kind of managedKinds; track kind) {
        <div class="surface-card p-4">
          <div class="text-xs font-bold text-brand-700 uppercase tracking-wide mb-2">{{ kind.replace('Managed Services · ', '') }}</div>
          @for (s of managed()[kind]; track s.contract.reference) {
            <div class="mb-4 last:mb-0">
              <div class="font-bold text-ink-900">{{ s.contract.name }}</div>
              <div class="text-xs text-ink-500 mb-2">{{ s.contract.vendorName }} · {{ s.contract.reference }} · {{ s.contract.startDate | date:'d MMM y' }} &rarr; {{ s.contract.endDate | date:'d MMM y' }}</div>
              <ng-container *ngTemplateOutlet="tiles; context: { $implicit: s, incentive: true }"></ng-container>
            </div>
          } @empty { <div class="text-sm text-ink-500">No contract is classified as {{ kind }} yet.</div> }
        </div>
      }
    </div>

    <!-- Active projects -->
    <h2 class="text-[15px] font-bold text-ink-900 mb-2 flex items-center gap-2"><mat-icon class="!text-lg text-brand-600">folder_special</mat-icon>Active Projects</h2>
    <div class="surface-card overflow-x-auto mb-5">
      <table class="crc-table w-full text-sm">
        <thead><tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide">
          <th class="px-3 py-2.5 font-medium">Project name</th><th class="px-3 py-2.5 font-medium">PO number</th><th class="px-3 py-2.5 font-medium text-right">Approved budget</th><th class="px-3 py-2.5 font-medium text-right">Expense</th><th class="px-3 py-2.5 font-medium text-right">Remaining</th><th class="px-3 py-2.5 font-medium">Start</th><th class="px-3 py-2.5 font-medium">End</th>
        </tr></thead>
        <tbody>
          @for (p of projects(); track p.id) {
            <tr class="border-t border-surface-border align-top">
              <td class="px-3 py-2.5 font-semibold text-ink-900">{{ p.name }}@if (p.alert) { <div class="mt-1"><span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-status-amber"><mat-icon class="!text-sm !w-4 !h-4">notifications_active</mat-icon>Ends in {{ p.left }} — plan renewal or closure</span></div> }</td>
              <td class="px-3 py-2.5 whitespace-nowrap text-ink-700">{{ p.po }}</td>
              <td class="px-3 py-2.5 text-right tabular-nums">{{ p.budget | number:'1.0-0' }}</td>
              <td class="px-3 py-2.5 text-right tabular-nums">{{ p.expense | number:'1.0-0' }}</td>
              <td class="px-3 py-2.5 text-right tabular-nums font-semibold" [class.text-status-red]="p.remaining < 0">{{ p.remaining | number:'1.0-0' }}</td>
              <td class="px-3 py-2.5 whitespace-nowrap text-ink-700">{{ p.start | date:'d MMM y' }}</td>
              <td class="px-3 py-2.5 whitespace-nowrap" [class.text-status-amber]="p.alert" [class.font-semibold]="p.alert">{{ p.end | date:'d MMM y' }}</td>
            </tr>
          } @empty { <tr><td colspan="7" class="px-4 py-10 text-center text-sm text-ink-400">No active projects right now.</td></tr> }
        </tbody>
      </table>
    </div>

    <!-- classification -->
    @if (store.can('Classify Contracts')) {
    <div class="surface-card mb-5">
      <button type="button" class="w-full flex items-center justify-between px-4 py-3 text-left" (click)="classifyOpen.set(!classifyOpen())">
        <span class="text-[13.5px] font-bold text-ink-900">Contract classification <span class="font-normal text-ink-400">— choose which contracts are reported above</span></span>
        <mat-icon class="text-ink-400">{{ classifyOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
      </button>
      @if (classifyOpen()) {
        <div class="overflow-x-auto border-t border-surface-border">
          <table class="w-full text-sm">
            <tbody>
              @for (c of allContracts(); track c.reference) {
                <tr class="border-t first:border-t-0 border-surface-border">
                  <td class="px-4 py-2"><div class="font-semibold text-ink-900">{{ c.name }}</div><div class="text-xs text-ink-400">{{ c.vendorName }} · {{ c.reference }}</div></td>
                  <td class="px-4 py-2 w-64">
                    <select class="w-full px-2.5 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700" [value]="store.serviceClass()[c.reference] ?? ''" (change)="classify(c.reference, $any($event.target).value)">
                      <option value="">Not reported</option>
                      @for (k of classes; track k) { <option [value]="k" [selected]="store.serviceClass()[c.reference] === k">{{ k }}</option> }
                    </select>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
    }

    <ng-template #tiles let-s let-incentive="incentive">
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
        <div class="rounded-lg bg-surface-subtle px-3 py-2.5"><div class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">{{ incentive ? 'Total approved incentive budget' : 'Total approved budget' }}</div><div class="text-lg font-extrabold text-ink-900 tabular-nums">{{ s.budget | number:'1.0-0' }} <span class="text-xs font-normal text-ink-400">OMR</span></div></div>
        <div class="rounded-lg bg-surface-subtle px-3 py-2.5"><div class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Expense</div><div class="text-lg font-extrabold text-ink-900 tabular-nums">{{ s.expense | number:'1.0-0' }} <span class="text-xs font-normal text-ink-400">OMR</span></div><div class="h-1.5 rounded-full bg-white mt-1.5 overflow-hidden"><div class="h-full rounded-full bg-brand-500" [style.width.%]="s.usedPct"></div></div></div>
        <div class="rounded-lg bg-surface-subtle px-3 py-2.5"><div class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Remaining amount</div><div class="text-lg font-extrabold tabular-nums" [class.text-status-red]="s.remaining < 0" [class.text-ink-900]="s.remaining >= 0">{{ s.remaining | number:'1.0-0' }} <span class="text-xs font-normal text-ink-400">OMR</span></div></div>
        <div class="rounded-lg bg-surface-subtle px-3 py-2.5"><div class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Savings</div><div class="text-lg font-extrabold text-ink-900 tabular-nums">{{ s.savings | number:'1.0-0' }} <span class="text-xs font-normal text-ink-400">OMR</span></div></div>
        <div class="rounded-lg bg-surface-subtle px-3 py-2.5"><div class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Savings %</div><div class="text-lg font-extrabold text-ink-900 tabular-nums">{{ s.savingsPct | number:'1.1-1' }}%</div></div>
      </div>
      @if (!incentive) { <div class="text-[11px] text-ink-400 mt-1.5">Savings count once the contract has ended: the unspent approved budget. Current headcount {{ s.headcount ?? '—' }}.</div> }
      @else { <div class="text-[11px] text-ink-400 mt-1.5">Savings count once the contract has ended: the unspent approved budget.</div> }
    </ng-template>
  `,
})
export class GeneralDashboardComponent {
  store = inject(CrcStore);
  private forecast = inject(ForecastService);
  private projectsSvc = inject(ProjectRequests);

  readonly alertMonths = ALERT_MONTHS;
  readonly secondmentItems = ['Salary', 'Overtime', 'Performance', 'Incentive'];
  readonly managedKinds: ServiceClass[] = ['Managed Services · Voice', 'Managed Services · Non Voice'];
  readonly classes = SERVICE_CLASSES;
  classifyOpen = signal(false);

  allContracts = computed(() => this.store.contracts().filter((c) => c.status !== 'Cancelled'));

  private summarize(c: Contract): ContractSummary {
    if (this.forecast.teamContract()?.reference === c.reference) return this.summarizeTeam(c);
    const rows = this.forecast.accrualRows().filter((r) => r.contract.reference === c.reference);
    const acts = this.forecast.actuals();
    const budget = rows.reduce((t, r) => t + r.budget, 0);
    const expense = [...new Set(rows.map((r) => r.key))].reduce((t, k) => t + Object.values(acts[k] ?? {}).reduce((a, b) => a + b, 0), 0);
    const remaining = budget - expense, ended = c.endDate < today();
    const savings = ended ? Math.max(0, remaining) : 0;
    const isTeam = this.forecast.teamContract()?.reference === c.reference;
    const teamMonths = this.forecast.teamMonths();
    const monthIsos = [...new Set(rows.flatMap((r) => this.forecast.monthsOf(r)))].sort();
    const months = monthIsos.map((iso) => {
      let invoiced: number | null = null, forecast: number | null = null;
      for (const r of rows) {
        if (!this.forecast.monthsOf(r).includes(iso)) continue;
        const cell = this.forecast.cell(r, iso);
        if (cell.actual) invoiced = (invoiced ?? 0) + (cell.value ?? 0);
        else if (cell.forecast !== null) forecast = (forecast ?? 0) + cell.forecast;
      }
      const hcs = isTeam ? Object.values(teamMonths).map((t) => t[iso]?.hc).filter((h): h is number => h !== undefined) : [];
      return { iso, label: this.forecast.monthLabel(iso), invoiced, forecast, headcount: hcs.length ? hcs.reduce((a, b) => a + b, 0) : null };
    });
    const headcount = isTeam ? this.store.agents().filter((a) => a.vendor === 'Infoline').length : null;
    return { contract: c, budget, expense, remaining, savings, savingsPct: budget ? (savings / budget) * 100 : 0, usedPct: budget ? Math.min(100, (expense / budget) * 100) : 0, ended, months, headcount };
  }

  /** The salary contract is tracked by team: approved budget per team per month, invoiced amounts for closed months and forecast after. */
  private summarizeTeam(c: Contract): ContractSummary {
    const tm = Object.values(this.forecast.teamMonths());
    const months = this.forecast.teamContractMonths().map((iso) => {
      const at = tm.map((t) => t[iso]).filter((x) => !!x);
      const total = at.reduce((t, x) => t + x.amount, 0), closed = this.forecast.isClosedMonth(iso);
      return { iso, label: this.forecast.monthLabel(iso), invoiced: closed ? total : null, forecast: closed || !at.length ? null : total, headcount: at.length ? at.reduce((t, x) => t + x.hc, 0) : null, budget: at.reduce((t, x) => t + x.budget, 0) };
    });
    const budget = months.reduce((t, m) => t + m.budget, 0), expense = months.reduce((t, m) => t + (m.invoiced ?? 0), 0);
    const remaining = budget - expense, ended = c.endDate < today(), savings = ended ? Math.max(0, remaining) : 0;
    return { contract: c, budget, expense, remaining, savings, savingsPct: budget ? (savings / budget) * 100 : 0, usedPct: budget ? Math.min(100, (expense / budget) * 100) : 0, ended, months, headcount: this.store.agents().filter((a) => a.vendor === 'Infoline').length };
  }

  private byClass = (k: ServiceClass) => this.allContracts().filter((c) => this.store.serviceClass()[c.reference] === k).map((c) => this.summarize(c));
  secondment = computed(() => this.byClass('Secondment'));
  managed = computed(() => ({ 'Managed Services · Voice': this.byClass('Managed Services · Voice'), 'Managed Services · Non Voice': this.byClass('Managed Services · Non Voice') } as Record<ServiceClass, ContractSummary[]>));

  projects = computed(() => {
    const now = today(), limit = addMonths(now, ALERT_MONTHS);
    return this.projectsSvc.projects()
      .filter((p) => p.status === 'Included in Budget' && p.from && p.to && p.from <= now && p.to >= now)
      .map((p) => {
        const rate = fx(p), budget = p.budget * rate, expense = (p.expense ?? 0) * rate, days = Math.round((+new Date(p.to!) - +new Date(now)) / 86400000);
        const left = days >= 60 ? `${Math.round(days / 30)} months` : `${days} day${days === 1 ? '' : 's'}`;
        return { id: p.id, name: p.name, po: p.poNumber ?? '—', budget, expense, remaining: budget - expense, start: p.from!, end: p.to!, alert: p.to! <= limit, left };
      })
      .sort((a, b) => a.end.localeCompare(b.end));
  });
  alerts = computed(() => this.projects().filter((p) => p.alert));

  constructor() {
    queueMicrotask(() => {
      for (const p of this.alerts()) {
        if (alerted.has(p.id)) continue;
        alerted.add(p.id);
        this.store.notify(`${p.name} (PO ${p.po}) ends in ${p.left} — plan its renewal or closure.`, 'General Dashboard', 'amber', '/contracts-budget/general-dashboard');
      }
    });
  }

  classify(ref: string, value: string) { this.store.setServiceClass(ref, (value as ServiceClass) || null); }
}
