import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { RequiresDirective } from '../../../shared/directives/requires.directive';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { AccrualCell, AccrualRow, CUR_MONTH, FY_YEAR, ForecastService, MONTHS, MONTH_LONG, MONTH_SHORT, isActual } from '../../../core/services/forecast.service';

const FIELD = 'w-full px-2.5 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 focus:outline-none focus:border-brand-400';
interface Line { r: AccrualRow; cells: AccrualCell[]; actual: number; forecast: number; total: number }
const sumOf = (cs: AccrualCell[], pick: (c: AccrualCell) => boolean) => cs.filter(pick).reduce((s, c) => s + (c.value ?? 0), 0);

@Component({
  selector: 'app-accrual-forecast',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule, MatTabsModule, PageHeaderComponent, KpiCardComponent, RequiresDirective],
  template: `
    <app-page-header
      title="Accrual Forecast"
      subtitle="Every contract PO line, month by month. Closed months show the invoiced amount; from {{ curLong }} on, the forecast."
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Forecast' }, { label: 'Accrual Forecast' }]"
    >
      <button mat-flat-button color="primary" (click)="svc.exportAccrual(filtered())" appRequires="Export Forecast"><mat-icon class="!text-base !mr-1">download</mat-icon>Export to Excel</button>
    </app-page-header>

    <div class="surface-card px-4 py-3.5 mb-4">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <label class="block"><span class="lbl">Supplier</span>
          <select [class]="field + ' mt-1'" (change)="vendor.set($any($event.target).value); contract.set('All')">
            <option value="All">All suppliers</option>
            @for (v of vendors(); track v) { <option [value]="v" [selected]="v === vendor()">{{ v }}</option> }
          </select></label>
        <label class="block"><span class="lbl">Contract</span>
          <select [class]="field + ' mt-1'" (change)="contract.set($any($event.target).value)">
            <option value="All">All contracts</option>
            @for (c of contracts(); track c) { <option [value]="c" [selected]="c === contract()">{{ c }}</option> }
          </select></label>
        <label class="block"><span class="lbl">Contract type</span>
          <select [class]="field + ' mt-1'" (change)="type.set($any($event.target).value)">
            <option value="All">All types</option>
            @for (t of types(); track t) { <option [value]="t" [selected]="t === type()">{{ t }}</option> }
          </select></label>
        <label class="block"><span class="lbl">Scope of work</span>
          <input [class]="field + ' mt-1'" placeholder="Search a line" [value]="q()" (input)="q.set($any($event.target).value)" /></label>
      </div>
      <div class="flex items-center justify-between mt-2.5 text-xs text-ink-400">
        <span>Forecast rule for other lines: <b class="text-ink-600">{{ svc.accrualRule() }}</b> · <a class="text-brand-600 font-medium" routerLink="/contracts-budget/forecast-settings" appRequires="Configure Forecast">Change</a></span>
        <button (click)="clear()" class="font-semibold text-brand-700 hover:underline">Clear filters</button>
      </div>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      <app-kpi-card [label]="'Actual — Jan to ' + lastActualShort" [value]="totals().actual | number:'1.0-0'" unit="OMR" icon="receipt_long" level="normal"></app-kpi-card>
      <app-kpi-card [label]="'Forecast — ' + curShort + ' to Dec'" [value]="totals().forecast | number:'1.0-0'" unit="OMR" icon="query_stats" level="info"></app-kpi-card>
      <app-kpi-card [label]="'Year total ' + year" [value]="totals().total | number:'1.0-0'" unit="OMR" icon="functions"></app-kpi-card>
      <app-kpi-card label="PO lines" [value]="filtered().length" icon="list_alt"></app-kpi-card>
    </div>

    <mat-tab-group>
      <mat-tab label="Per line">
        <div class="surface-card overflow-x-auto mt-4">
          <table class="crc-table w-full text-sm">
            <thead><tr class="bg-surface-subtle text-left text-[11px] text-ink-500 uppercase tracking-wide">
              <th class="px-3 py-2.5 font-medium sticky left-0 bg-surface-subtle min-w-[240px]">Scope of work</th>
              @for (m of months; track m) { <th class="px-2.5 py-2.5 font-medium text-right whitespace-nowrap" [class.text-brand-700]="!isActual(m)">{{ short[m] }}@if (!isActual(m)) {<span class="ml-0.5 text-[9px]">F</span>}</th> }
              <th class="px-2.5 py-2.5 font-medium text-right">Actual</th><th class="px-2.5 py-2.5 font-medium text-right">Forecast</th><th class="px-2.5 py-2.5 font-medium text-right">Year</th>
            </tr></thead>
            <tbody>
              @for (g of groups(); track g.ref) {
                <tr class="border-t-2 border-surface-border bg-surface-subtle/60">
                  <td class="px-3 py-2 sticky left-0 bg-surface-subtle" [attr.colspan]="1">
                    <div class="font-semibold text-ink-900">{{ g.vendor }}</div>
                    <div class="text-[11px] text-ink-500">{{ g.ref }} · PO {{ g.po || '—' }} · {{ g.from }} → {{ g.to }} · value {{ g.value | number:'1.0-0' }} OMR@if (g.renewal) { · <span class="text-status-amber font-semibold">renewal in progress</span>}</div>
                  </td>
                  @for (m of months; track m) { <td class="px-2.5 py-2 text-right text-xs font-semibold text-ink-700">{{ g.sub[m] ? (g.sub[m] | number:'1.0-0') : '—' }}</td> }
                  <td class="px-2.5 py-2 text-right text-xs font-semibold">{{ g.actual | number:'1.0-0' }}</td><td class="px-2.5 py-2 text-right text-xs font-semibold text-brand-700">{{ g.forecast | number:'1.0-0' }}</td><td class="px-2.5 py-2 text-right text-xs font-bold">{{ g.total | number:'1.0-0' }}</td>
                </tr>
                @for (l of g.lines; track l.r.key) {
                  <tr class="border-t border-surface-border hover:bg-surface-subtle/40">
                    <td class="px-3 py-1.5 sticky left-0 bg-white">
                      <span class="text-ink-800">{{ l.r.line }}</span>
                      @if (l.r.feed; as f) { <a class="ml-1.5 text-[10px] font-bold uppercase text-brand-600 hover:underline" [routerLink]="f.kind === 'Team' ? '/contracts-budget/team-forecast' : '/contracts-budget/transaction-forecast'" title="The forecast of this line comes from the {{ f.kind }} Forecast">{{ f.kind }}</a> }
                    </td>
                    @for (c of l.cells; track $index) {
                      <td class="px-2.5 py-1.5 text-right whitespace-nowrap" [title]="c.source + (c.renewal ? ' · contract renewal in progress' : '')"
                        [class.text-ink-900]="c.actual" [class.bg-brand-50]="!c.actual && c.value !== null" [class.text-brand-700]="!c.actual && !c.manual && c.value !== null" [class.text-status-amber]="c.manual" [class.font-semibold]="c.manual"
                        [class.ed]="editable(l.r, c)" (click)="editable(l.r, c) && edit(l.r, $index)">
                        {{ c.value === null ? '—' : (c.value | number:'1.0-0') }}
                      </td>
                    }
                    <td class="px-2.5 py-1.5 text-right">{{ l.actual | number:'1.0-0' }}</td><td class="px-2.5 py-1.5 text-right text-brand-700">{{ l.forecast | number:'1.0-0' }}</td><td class="px-2.5 py-1.5 text-right font-semibold">{{ l.total | number:'1.0-0' }}</td>
                  </tr>
                }
              } @empty {
                <tr><td colspan="16" class="px-4 py-10 text-center text-sm text-ink-400">No PO lines match these filters.</td></tr>
              }
            </tbody>
            @if (groups().length) {
              <tfoot><tr class="border-t-2 border-surface-border font-bold bg-surface-subtle/50">
                <td class="px-3 py-2.5 sticky left-0 bg-surface-subtle">Grand total</td>
                @for (m of months; track m) { <td class="px-2.5 py-2.5 text-right">{{ totals().month[m] | number:'1.0-0' }}</td> }
                <td class="px-2.5 py-2.5 text-right">{{ totals().actual | number:'1.0-0' }}</td><td class="px-2.5 py-2.5 text-right text-brand-700">{{ totals().forecast | number:'1.0-0' }}</td><td class="px-2.5 py-2.5 text-right">{{ totals().total | number:'1.0-0' }}</td>
              </tr></tfoot>
            }
          </table>
        </div>
        <p class="text-xs text-ink-400 mt-3 leading-relaxed">
          Amounts in OMR. <b class="text-ink-700">Black</b> = actual (invoiced; a line approved in Reconciliation becomes actual at once) · <span class="text-brand-700 bg-brand-50 px-1">tinted</span> = forecast · <span class="text-status-amber font-semibold">amber</span> = typed by hand · — = outside the contract period.
          Lines tagged <b class="text-brand-600">TEAM</b> or <b class="text-brand-600">TRANSACTION</b> take their forecast from that screen. Click a forecast cell of any other line to change it.
        </p>
      </mat-tab>

      <mat-tab label="Change history ({{ history().length }})">
        <div class="surface-card overflow-x-auto mt-4">
          <table class="crc-table w-full text-sm">
            <thead><tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide"><th class="px-3 py-2.5 font-medium">When</th><th class="px-3 py-2.5 font-medium">By</th><th class="px-3 py-2.5 font-medium">Line</th><th class="px-3 py-2.5 font-medium">Month</th><th class="px-3 py-2.5 font-medium">Change</th><th class="px-3 py-2.5 font-medium text-right">From</th><th class="px-3 py-2.5 font-medium text-right">To</th><th class="px-3 py-2.5 font-medium">Reason</th></tr></thead>
            <tbody>
              @for (e of history(); track e.id) {
                <tr class="border-t border-surface-border"><td class="px-3 py-2 whitespace-nowrap">{{ e.at | date:'d MMM, HH:mm' }}</td><td class="px-3 py-2">{{ e.by }}</td><td class="px-3 py-2">{{ e.item }}</td><td class="px-3 py-2">{{ long[e.month] }}</td><td class="px-3 py-2">{{ e.field }}</td><td class="px-3 py-2 text-right">{{ e.from | number:'1.0-3' }}</td><td class="px-3 py-2 text-right font-semibold">{{ e.to | number:'1.0-3' }}</td><td class="px-3 py-2 text-ink-600">{{ e.reason }}</td></tr>
              } @empty { <tr><td colspan="8" class="px-4 py-10 text-center text-sm text-ink-400">No forecast has been changed by hand yet.</td></tr> }
            </tbody>
          </table>
        </div>
      </mat-tab>
    </mat-tab-group>
  `,
  styles: [`.ed { cursor: pointer; } .ed:hover { outline: 1px solid #fb923c; outline-offset: -1px; } .lbl { font-size: 10.5px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: .04em; }`],
})
export class AccrualForecastComponent {
  store = inject(CrcStore);
  svc = inject(ForecastService);
  private ui = inject(UiService);

  field = FIELD;
  year = FY_YEAR;
  months = MONTHS;
  short = MONTH_SHORT;
  long = MONTH_LONG;
  isActual = isActual;
  curShort = MONTH_SHORT[CUR_MONTH];
  curLong = MONTH_LONG[CUR_MONTH];
  lastActualShort = MONTH_SHORT[Math.max(0, CUR_MONTH - 1)];

  vendor = signal('All');
  contract = signal('All');
  type = signal('All');
  q = signal('');

  vendors = computed(() => [...new Set(this.svc.accrualRows().map((r) => r.vendor))]);
  contracts = computed(() => [...new Set(this.svc.accrualRows().filter((r) => this.vendor() === 'All' || r.vendor === this.vendor()).map((r) => r.contract.reference))]);
  types = computed(() => [...new Set(this.svc.accrualRows().map((r) => r.contract.contractType))]);

  filtered = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.svc.accrualRows().filter((r) => (this.vendor() === 'All' || r.vendor === this.vendor()) && (this.contract() === 'All' || r.contract.reference === this.contract()) && (this.type() === 'All' || r.contract.contractType === this.type()) && (!q || r.line.toLowerCase().includes(q)));
  });

  private lines = computed<Line[]>(() => this.filtered().map((r) => {
    const cells = MONTHS.map((m) => this.svc.cell(r, m));
    const actual = sumOf(cells, (c) => c.actual), forecast = sumOf(cells, (c) => !c.actual);
    return { r, cells, actual, forecast, total: actual + forecast };
  }));

  groups = computed(() => {
    const out: Array<{ ref: string; vendor: string; po: string; from: string; to: string; value: number; renewal: boolean; lines: Line[]; sub: number[]; actual: number; forecast: number; total: number }> = [];
    for (const l of this.lines()) {
      let g = out.find((x) => x.ref === l.r.contract.reference);
      if (!g) { const c = l.r.contract; g = { ref: c.reference, vendor: l.r.vendor, po: l.r.po, from: c.startDate, to: c.endDate, value: c.amount, renewal: c.renewalStatus === 'Renewal in progress', lines: [], sub: MONTHS.map(() => 0), actual: 0, forecast: 0, total: 0 }; out.push(g); }
      g.lines.push(l);
      l.cells.forEach((c, m) => (g!.sub[m] += c.value ?? 0));
      g.actual += l.actual; g.forecast += l.forecast; g.total += l.total;
    }
    return out;
  });

  totals = computed(() => {
    const ls = this.lines();
    return { month: MONTHS.map((m) => ls.reduce((s, l) => s + (l.cells[m].value ?? 0), 0)), actual: ls.reduce((s, l) => s + l.actual, 0), forecast: ls.reduce((s, l) => s + l.forecast, 0), total: ls.reduce((s, l) => s + l.total, 0) };
  });

  history = computed(() => this.svc.edits().filter((e) => e.kind === 'Accrual'));

  editable = (r: AccrualRow, c: AccrualCell) => !r.feed && !c.actual && c.value !== null && this.store.can('Edit Forecast');
  clear() { this.vendor.set('All'); this.contract.set('All'); this.type.set('All'); this.q.set(''); }

  async edit(r: AccrualRow, m: number) {
    if (!this.ui.requires('Edit Forecast')) return;
    const c = this.svc.cell(r, m);
    const v = await this.ui.form({
      title: `Forecast — ${MONTH_LONG[m]} ${FY_YEAR}`, subtitle: `${r.vendor} · ${r.contract.reference} · ${r.line}. Now ${c.value?.toLocaleString('en-GB')} OMR (${c.source}).`, icon: 'edit', submitLabel: 'Save forecast',
      values: { amount: c.manual ? c.value : '' },
      fields: [
        { key: 'amount', label: 'Forecast amount (OMR)', type: 'number', min: 0, hint: `Leave empty to go back to the automatic forecast (${this.svc.accrualRule().toLowerCase()}).` },
        { key: 'reason', label: 'Reason', type: 'textarea', required: true },
      ],
    });
    if (!v) return;
    const amount = v['amount'] === '' || v['amount'] === null || v['amount'] === undefined ? null : Number(v['amount']);
    const err = this.svc.setAccrual(r, m, amount, v['reason'] ?? '');
    this.ui.toast(err ?? 'Forecast saved.', err ? 5000 : 3000);
  }
}
