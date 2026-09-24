import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { RequiresDirective } from '../../../shared/directives/requires.directive';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { CUR_MONTH, FY_YEAR, ForecastService, MONTHS, MONTH_LONG, MONTH_SHORT, isActual } from '../../../core/services/forecast.service';

const FIELD = 'w-full px-2.5 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 focus:outline-none focus:border-brand-400';
const TH = 'px-3 py-2.5 font-medium';

/** "Budget Forecasting By Team": the salary PO split by team — approved budget and head count against actual and forecast, and the saving. */
@Component({
  selector: 'app-team-forecast',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatTabsModule, PageHeaderComponent, KpiCardComponent, RequiresDirective],
  template: `
    <app-page-header
      title="Team Forecast"
      subtitle="The salary PO split by team: approved budget and head count against the actual and forecast cost. Closed months are actual; from {{ long[cur] }} on, forecast."
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Forecast' }, { label: 'Team Forecast' }]"
    >
      <button mat-stroked-button (click)="addTeam()" appRequires="Configure Forecast"><mat-icon class="!text-base !mr-1">group_add</mat-icon>Add team</button>
      <button mat-flat-button color="primary" (click)="svc.exportTeam()" appRequires="Export Forecast"><mat-icon class="!text-base !mr-1">download</mat-icon>Export to Excel</button>
    </app-page-header>

    <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-2">
      <app-kpi-card label="Approved budget" [value]="s().budget | number:'1.0-0'" unit="OMR" icon="account_balance_wallet"></app-kpi-card>
      <app-kpi-card [label]="'Accrual — Jan to ' + short[lastActual]" [value]="s().actual | number:'1.0-0'" unit="OMR" icon="receipt_long" level="normal"></app-kpi-card>
      <app-kpi-card [label]="'Forecast — ' + short[cur] + ' to Dec'" [value]="s().forecast | number:'1.0-0'" unit="OMR" icon="query_stats" level="info"></app-kpi-card>
      <app-kpi-card label="Total with forecast" [value]="s().total | number:'1.0-0'" unit="OMR" icon="functions"></app-kpi-card>
      <app-kpi-card label="Saving amount" [value]="s().saving | number:'1.0-0'" unit="OMR" icon="savings" [level]="s().saving < 0 ? 'red' : 'normal'"></app-kpi-card>
      <app-kpi-card label="Saving %" [value]="(s().pct | number:'1.2-2') + '%'" icon="percent" [level]="s().saving < 0 ? 'red' : 'normal'"></app-kpi-card>
    </div>
    <p class="text-xs text-ink-500 mb-4 px-1">PO {{ po }} · head count in {{ long[cur] }}: <b class="text-ink-700">{{ s().hc }}</b> against <b class="text-ink-700">{{ s().approvedHc }}</b> approved · saving = approved budget − (accrual + forecast).</p>

    <mat-tab-group [selectedIndex]="tab()" (selectedIndexChange)="tab.set($event)">
      <mat-tab label="By team">
        <div class="surface-card overflow-x-auto mt-4">
          <table class="crc-table w-full text-sm">
            <thead><tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide">
              <th [class]="th">Team</th><th [class]="th + ' text-right'">Approved HC</th><th [class]="th + ' text-right'">HC {{ short[cur] }}</th><th [class]="th + ' text-right'">Approved budget</th>
              <th [class]="th + ' text-right'">Accrual</th><th [class]="th + ' text-right'">Forecast</th><th [class]="th + ' text-right'">Total</th><th [class]="th + ' text-right'">Saving</th><th [class]="th + ' text-right'">Saving %</th><th [class]="th"></th>
            </tr></thead>
            <tbody>
              @for (t of byTeam(); track t.name) {
                <tr class="border-t border-surface-border hover:bg-surface-subtle/60 cursor-pointer" (click)="open(t.name)">
                  <td class="px-3 py-2.5 font-medium text-ink-900">{{ t.name }}@if (t.from > 0) { <span class="ml-1 text-[11px] text-ink-400">from {{ short[t.from] }}</span> }</td>
                  <td class="px-3 py-2.5 text-right">{{ t.approvedHc ?? '—' }}</td>
                  <td class="px-3 py-2.5 text-right" [class.text-status-red]="t.approvedHc !== null && t.hc > t.approvedHc" [class.font-semibold]="t.approvedHc !== null && t.hc > t.approvedHc">{{ t.hc }}</td>
                  <td class="px-3 py-2.5 text-right">{{ t.budget | number:'1.0-0' }}</td>
                  <td class="px-3 py-2.5 text-right">{{ t.actual | number:'1.0-0' }}</td>
                  <td class="px-3 py-2.5 text-right text-brand-700">{{ t.forecast | number:'1.0-0' }}</td>
                  <td class="px-3 py-2.5 text-right font-semibold">{{ t.total | number:'1.0-0' }}</td>
                  <td class="px-3 py-2.5 text-right font-semibold" [class.text-status-red]="t.saving < 0" [class.text-status-green]="t.saving > 0">{{ t.saving | number:'1.0-0' }}</td>
                  <td class="px-3 py-2.5 text-right" [class.text-status-red]="t.saving < 0">{{ t.pct | number:'1.1-1' }}%</td>
                  <td class="px-3 py-2.5 text-right"><mat-icon class="!text-lg text-ink-400">chevron_right</mat-icon></td>
                </tr>
              }
            </tbody>
            <tfoot><tr class="border-t-2 border-surface-border font-bold bg-surface-subtle/50">
              <td class="px-3 py-2.5">Total</td><td class="px-3 py-2.5 text-right">{{ s().approvedHc }}</td><td class="px-3 py-2.5 text-right">{{ s().hc }}</td><td class="px-3 py-2.5 text-right">{{ s().budget | number:'1.0-0' }}</td>
              <td class="px-3 py-2.5 text-right">{{ s().actual | number:'1.0-0' }}</td><td class="px-3 py-2.5 text-right text-brand-700">{{ s().forecast | number:'1.0-0' }}</td><td class="px-3 py-2.5 text-right">{{ s().total | number:'1.0-0' }}</td>
              <td class="px-3 py-2.5 text-right" [class.text-status-red]="s().saving < 0">{{ s().saving | number:'1.0-0' }}</td><td class="px-3 py-2.5 text-right">{{ s().pct | number:'1.1-1' }}%</td><td></td>
            </tr></tfoot>
          </table>
        </div>
        <p class="text-xs text-ink-400 mt-3">Amounts in OMR. Click a team to see and change its months. The monthly total of all teams is the forecast of the salary line on the Accrual Forecast.</p>
      </mat-tab>

      <mat-tab label="Monthly by team">
        <div class="surface-card px-4 py-3.5 mt-4 mb-4 flex flex-wrap items-end gap-3">
          <label class="block w-72"><span class="lbl">Team</span>
            <select [class]="field + ' mt-1'" (change)="team.set($any($event.target).value)">
              @for (t of svc.teams(); track t.name) { <option [value]="t.name" [selected]="t.name === team()">{{ t.name }}</option> }
            </select></label>
          <span class="text-xs text-ink-400 pb-2">Forecast head count defaults to the last actual month; the amount follows at that month's cost per head unless you type it.</span>
        </div>
        <div class="surface-card overflow-x-auto">
          <table class="crc-table w-full text-sm">
            <thead><tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide">
              <th [class]="th">Month</th><th [class]="th">Type</th><th [class]="th + ' text-right'">Approved budget</th><th [class]="th + ' text-right'">Approved HC</th><th [class]="th + ' text-right'">Head count</th><th [class]="th + ' text-right'">Amount</th><th [class]="th + ' text-right'">Saving</th><th [class]="th + ' text-right'"></th>
            </tr></thead>
            <tbody>
              @for (r of monthly(); track r.m) {
                <tr class="border-t border-surface-border" [class.bg-brand-50]="!r.actual">
                  <td class="px-3 py-2 font-medium text-ink-900">{{ long[r.m] }} {{ year }}</td>
                  <td class="px-3 py-2"><span class="text-[11px] font-bold uppercase" [class.text-ink-500]="r.actual" [class.text-brand-700]="!r.actual" [class.text-status-amber]="r.manual">{{ r.actual ? 'Actual' : r.manual ? 'Forecast · changed' : 'Forecast' }}</span></td>
                  <td class="px-3 py-2 text-right">{{ r.budget | number:'1.0-3' }}</td>
                  <td class="px-3 py-2 text-right">{{ r.approvedHc ?? '—' }}</td>
                  <td class="px-3 py-2 text-right">{{ r.hc }}</td>
                  <td class="px-3 py-2 text-right font-semibold">{{ r.amount | number:'1.0-3' }}</td>
                  <td class="px-3 py-2 text-right" [class.text-status-red]="r.saving < 0" [class.text-status-green]="r.saving > 0">{{ r.saving | number:'1.0-3' }}</td>
                  <td class="px-3 py-2 text-right">@if (!r.actual && r.started && store.can('Edit Forecast')) { <button class="act" title="Change the forecast" (click)="edit(r.m)"><mat-icon>edit</mat-icon></button> }</td>
                </tr>
              }
            </tbody>
            <tfoot><tr class="border-t-2 border-surface-border font-bold bg-surface-subtle/50">
              <td class="px-3 py-2.5" colspan="2">Year</td><td class="px-3 py-2.5 text-right">{{ monthlyTotal().budget | number:'1.0-3' }}</td><td></td><td></td>
              <td class="px-3 py-2.5 text-right">{{ monthlyTotal().amount | number:'1.0-3' }}</td><td class="px-3 py-2.5 text-right" [class.text-status-red]="monthlyTotal().saving < 0">{{ monthlyTotal().saving | number:'1.0-3' }}</td><td></td>
            </tr></tfoot>
          </table>
        </div>
      </mat-tab>

      <mat-tab label="Saving by month">
        <div class="surface-card overflow-x-auto mt-4">
          <table class="crc-table w-full text-sm">
            <thead><tr class="bg-surface-subtle text-left text-[11px] text-ink-500 uppercase tracking-wide">
              <th [class]="th">Month</th>
              @for (t of svc.teams(); track t.name) { <th class="px-2.5 py-2.5 font-medium text-right min-w-[92px]">{{ t.name }}</th> }
              <th [class]="th + ' text-right'">Total</th>
            </tr></thead>
            <tbody>
              @for (m of months; track m) {
                <tr class="border-t border-surface-border" [class.bg-brand-50]="!isActual(m)">
                  <td class="px-3 py-2 font-medium whitespace-nowrap">{{ short[m] }} {{ year }}@if (!isActual(m)) {<span class="ml-1 text-[10px] font-bold text-brand-700">F</span>}</td>
                  @for (t of svc.teams(); track t.name) { <td class="px-2.5 py-2 text-right" [class.text-status-red]="saving(t.name, m) < 0">{{ saving(t.name, m) | number:'1.0-0' }}</td> }
                  <td class="px-3 py-2 text-right font-semibold" [class.text-status-red]="monthSaving(m) < 0">{{ monthSaving(m) | number:'1.0-0' }}</td>
                </tr>
              }
            </tbody>
            <tfoot><tr class="border-t-2 border-surface-border font-bold bg-surface-subtle/50">
              <td class="px-3 py-2.5">Total</td>
              @for (t of byTeam(); track t.name) { <td class="px-2.5 py-2.5 text-right" [class.text-status-red]="t.saving < 0">{{ t.saving | number:'1.0-0' }}</td> }
              <td class="px-3 py-2.5 text-right" [class.text-status-red]="s().saving < 0">{{ s().saving | number:'1.0-0' }}</td>
            </tr></tfoot>
          </table>
        </div>
        <p class="text-xs text-ink-400 mt-3">Saving = the team's approved budget for the month − its actual or forecast amount. Negative (red) = over budget.</p>
      </mat-tab>

      <mat-tab label="Change history ({{ history().length }})">
        <div class="surface-card overflow-x-auto mt-4">
          <table class="crc-table w-full text-sm">
            <thead><tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide"><th [class]="th">When</th><th [class]="th">By</th><th [class]="th">Team</th><th [class]="th">Month</th><th [class]="th">Change</th><th [class]="th + ' text-right'">From</th><th [class]="th + ' text-right'">To</th><th [class]="th">Reason</th></tr></thead>
            <tbody>
              @for (e of history(); track e.id) {
                <tr class="border-t border-surface-border"><td class="px-3 py-2 whitespace-nowrap">{{ e.at | date:'d MMM, HH:mm' }}</td><td class="px-3 py-2">{{ e.by }}</td><td class="px-3 py-2">{{ e.item }}</td><td class="px-3 py-2">{{ long[e.month] }}</td><td class="px-3 py-2">{{ e.field }}</td><td class="px-3 py-2 text-right">{{ e.from | number:'1.0-3' }}</td><td class="px-3 py-2 text-right font-semibold">{{ e.to | number:'1.0-3' }}</td><td class="px-3 py-2 text-ink-600">{{ e.reason }}</td></tr>
              } @empty { <tr><td colspan="8" class="px-4 py-10 text-center text-sm text-ink-400">No team forecast has been changed yet.</td></tr> }
            </tbody>
          </table>
        </div>
      </mat-tab>
    </mat-tab-group>
  `,
  styles: [`.lbl { font-size: 10.5px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: .04em; } .act { width: 30px; height: 30px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; color: #6b7280; } .act:hover { background: #f3f4f6; color: #111827; } .act mat-icon { font-size: 18px; width: 18px; height: 18px; line-height: 18px; }`],
})
export class TeamForecastComponent {
  store = inject(CrcStore);
  svc = inject(ForecastService);
  private ui = inject(UiService);

  field = FIELD;
  th = TH;
  year = FY_YEAR;
  cur = CUR_MONTH;
  lastActual = Math.max(0, CUR_MONTH - 1);
  months = MONTHS;
  short = MONTH_SHORT;
  long = MONTH_LONG;
  isActual = isActual;
  po = '325100185';

  tab = signal(0);
  team = signal(this.svc.teams()[0].name);
  s = this.svc.teamSummary;

  byTeam = computed(() => this.svc.teams().map((t) => {
    const budget = t.budget.reduce((a, b) => a + b, 0);
    const actual = MONTHS.filter(isActual).reduce((x, m) => x + this.svc.teamAmount(t.name, m), 0);
    const forecast = MONTHS.filter((m) => !isActual(m)).reduce((x, m) => x + this.svc.teamAmount(t.name, m), 0);
    const total = actual + forecast;
    return { name: t.name, from: t.from, approvedHc: t.approvedHc, hc: this.svc.teamHc(t.name, CUR_MONTH), budget, actual, forecast, total, saving: budget - total, pct: budget ? ((budget - total) / budget) * 100 : 0 };
  }));

  monthly = computed(() => {
    const t = this.svc.teams().find((x) => x.name === this.team())!;
    return MONTHS.map((m) => {
      const amount = this.svc.teamAmount(t.name, m);
      return { m, actual: isActual(m), manual: this.svc.teamManual(t.name, m), started: m >= t.from, budget: t.budget[m], approvedHc: m >= t.from ? t.approvedHc : null, hc: this.svc.teamHc(t.name, m), amount, saving: t.budget[m] - amount };
    });
  });
  monthlyTotal = computed(() => this.monthly().reduce((s, r) => ({ budget: s.budget + r.budget, amount: s.amount + r.amount, saving: s.saving + r.saving }), { budget: 0, amount: 0, saving: 0 }));

  history = computed(() => this.svc.edits().filter((e) => e.kind === 'Team'));

  saving = (team: string, m: number) => (this.svc.teams().find((t) => t.name === team)?.budget[m] ?? 0) - this.svc.teamAmount(team, m);
  monthSaving = (m: number) => this.svc.teams().reduce((s, t) => s + this.saving(t.name, m), 0);
  open(name: string) { this.team.set(name); this.tab.set(1); }

  async edit(m: number) {
    if (!this.ui.requires('Edit Forecast')) return;
    const team = this.team();
    const hc = this.svc.teamHc(team, m), amount = this.svc.teamAmount(team, m);
    const v = await this.ui.form({
      title: `${team} — ${MONTH_LONG[m]} ${FY_YEAR}`, subtitle: `Now ${hc} head count, ${amount.toLocaleString('en-GB')} OMR.`, icon: 'edit', submitLabel: 'Save forecast',
      values: { hc, amount: '' },
      fields: [
        { key: 'hc', label: 'Head count', type: 'number', min: 0, required: true },
        { key: 'amount', label: 'Amount (OMR)', type: 'number', min: 0, hint: 'Leave empty to price the head count at the last actual cost per head.' },
        { key: 'reason', label: 'Reason', type: 'textarea', required: true },
      ],
    });
    if (!v) return;
    const typed = v['amount'] === '' || v['amount'] === null || v['amount'] === undefined ? null : Number(v['amount']);
    const err = this.svc.setTeamMonth(team, m, Number(v['hc']), typed, v['reason'] ?? '');
    this.ui.toast(err ?? 'Team forecast saved.', err ? 5000 : 3000);
  }

  async addTeam() {
    if (!this.ui.requires('Configure Forecast')) return;
    const v = await this.ui.form({
      title: 'Add a team', subtitle: `A team that joins PO ${this.po} during ${FY_YEAR}. It counts from its first month.`, icon: 'group_add', submitLabel: 'Add team',
      values: { from: String(CUR_MONTH) },
      fields: [
        { key: 'name', label: 'Team name', required: true },
        { key: 'from', label: 'First month', type: 'select', required: true, options: MONTHS.filter((m) => !isActual(m)).map((m) => ({ value: String(m), label: `${MONTH_LONG[m]} ${FY_YEAR}` })) },
        { key: 'budget', label: 'Approved budget per month (OMR)', type: 'number', min: 0, required: true },
        { key: 'approvedHc', label: 'Approved head count', type: 'number', min: 0 },
        { key: 'hc', label: 'Head count', type: 'number', min: 0, required: true },
        { key: 'amount', label: 'Cost per month (OMR)', type: 'number', min: 0, required: true },
      ],
    });
    if (!v) return;
    const err = this.svc.addTeam({ name: v['name'] ?? '', from: Number(v['from']), budget: Number(v['budget']) || 0, approvedHc: v['approvedHc'] === '' || v['approvedHc'] == null ? null : Number(v['approvedHc']), hc: Number(v['hc']) || 0, amount: Number(v['amount']) || 0 });
    if (err) { this.ui.toast(err, 5000); return; }
    this.ui.toast(`${v['name']} added.`);
    this.open(String(v['name']).trim());
  }
}
