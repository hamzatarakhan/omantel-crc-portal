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
import { AccrualCell, AccrualRow, CUR_MONTH, FY_YEAR, ForecastService, MONTHS, MONTH_LONG, MONTH_SHORT } from '../../../core/services/forecast.service';

const FIELD = 'w-full px-2.5 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 focus:outline-none focus:border-brand-400';
interface Line { r: AccrualRow; cells: AccrualCell[]; forecast: number; actual: number; expected: number }
interface Totals { month: number[]; forecast: number; actual: number; expected: number; actualForecast: number }

const totalsOf = (ls: Line[]): Totals => ({
  month: MONTHS.map((m) => ls.reduce((s, l) => s + (l.cells[m].value ?? 0), 0)),
  forecast: ls.reduce((s, l) => s + l.forecast, 0),
  actual: ls.reduce((s, l) => s + l.actual, 0),
  expected: ls.reduce((s, l) => s + l.expected, 0),
  actualForecast: ls.reduce((s, l) => s + l.cells.filter((c) => c.actual).reduce((x, c) => x + (c.forecast ?? 0), 0), 0),
});

/**
 * "Per Line": the yearly forecast is entered once per line and month; each month switches to the approved invoice amount
 * as soon as the invoice is approved in Reconciliation, and the forecast stays for comparison.
 */
@Component({
  selector: 'app-accrual-forecast',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule, MatTabsModule, PageHeaderComponent, KpiCardComponent, RequiresDirective],
  template: `
    <app-page-header
      title="Accrual Forecast"
      subtitle="The yearly forecast of every contract PO line, month by month. A month switches to the actual amount as soon as its invoice is approved."
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Forecast' }, { label: 'Accrual Forecast' }]"
    >
      @if (!editing()) {
        <button mat-stroked-button (click)="startEdit()" appRequires="Edit Forecast"><mat-icon class="!text-base !mr-1">edit_calendar</mat-icon>Enter / change yearly forecast</button>
        <button mat-flat-button color="primary" (click)="svc.exportAccrual(filtered())" appRequires="Export Forecast"><mat-icon class="!text-base !mr-1">download</mat-icon>Export to Excel</button>
      }
    </app-page-header>

    <div class="surface-card px-4 py-3.5 mb-4">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <label class="block"><span class="lbl">Vendor</span>
          <select [class]="field + ' mt-1'" (change)="vendor.set($any($event.target).value); contract.set('All')">
            <option value="All" [selected]="vendor() === 'All'">All vendors</option>
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
      <div class="flex justify-end mt-2.5 text-xs"><button (click)="clear()" class="font-semibold text-brand-700 hover:underline">Clear filters</button></div>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
      <app-kpi-card [label]="'Yearly forecast ' + year" [value]="totals().forecast | number:'1.0-0'" unit="OMR" icon="edit_calendar" level="info"></app-kpi-card>
      <app-kpi-card label="Actual — approved invoices" [value]="totals().actual | number:'1.0-0'" unit="OMR" icon="receipt_long" level="normal"></app-kpi-card>
      <app-kpi-card label="Remaining forecast" [value]="(totals().expected - totals().actual) | number:'1.0-0'" unit="OMR" icon="query_stats"></app-kpi-card>
      <app-kpi-card label="Expected year total" [value]="totals().expected | number:'1.0-0'" unit="OMR" icon="functions"></app-kpi-card>
    </div>
    <p class="text-xs text-ink-500 mb-4 px-1">
      On the months already invoiced, actual is <b [class.text-status-red]="variance() > 0" [class.text-status-green]="variance() < 0">{{ variance() > 0 ? '+' : '' }}{{ variance() | number:'1.0-0' }} OMR</b>
      ({{ variancePct() | number:'1.1-1' }}%) against the forecast. Expected year total = approved invoices + the forecast of the months not invoiced yet.
    </p>

    <mat-tab-group>
      <mat-tab label="Per line">
        <div class="surface-card px-4 py-3 mt-4 flex flex-wrap items-center gap-3 border-l-4 !border-l-brand-500">
          <mat-icon class="text-brand-600">{{ editing() ? 'edit_note' : 'edit_calendar' }}</mat-icon>
          @if (editing()) {
            <div class="flex-1 min-w-[260px] text-sm text-ink-700"><b>Editing the yearly forecast.</b> Type the amount of each line for each month in the boxes. Months with an approved invoice are locked; lines tagged TEAM or TRANSACTION are changed on those screens. Save or cancel from the bar at the bottom.</div>
          } @else {
            <div class="flex-1 min-w-[260px] text-sm text-ink-700">The <span class="text-brand-700 bg-brand-50 px-1 font-semibold">tinted</span> months ({{ short[cur] }} – Dec) are still forecast and can be changed. Click one, or use the button, to type the forecast of each line for each month.</div>
            <button mat-flat-button color="primary" (click)="startEdit()" appRequires="Edit Forecast"><mat-icon class="!text-base !mr-1">edit_calendar</mat-icon>Enter / change yearly forecast</button>
          }
        </div>
        <div class="surface-card overflow-x-auto mt-4">
          <table class="crc-table w-full text-sm">
            <thead><tr class="bg-surface-subtle text-left text-[11px] text-ink-500 uppercase tracking-wide">
              <th class="px-3 py-2.5 font-medium sticky left-0 bg-surface-subtle min-w-[240px] z-10">Scope of work</th>
              @for (m of months; track m) { <th class="px-2.5 py-2.5 font-medium text-right whitespace-nowrap">{{ short[m] }}</th> }
              <th class="px-2.5 py-2.5 font-medium text-right">Forecast</th><th class="px-2.5 py-2.5 font-medium text-right">Actual</th><th class="px-2.5 py-2.5 font-medium text-right">Expected</th>
            </tr></thead>
            <tbody>
              @for (g of groups(); track g.ref) {
                <tr class="border-t-2 border-surface-border bg-surface-subtle/60">
                  <td class="px-3 py-2 sticky left-0 bg-surface-subtle z-10">
                    <div class="font-semibold text-ink-900">{{ g.vendor }}</div>
                    <div class="text-[11px] text-ink-500">{{ g.ref }} · PO {{ g.po || '—' }} · {{ g.from }} → {{ g.to }} · value {{ g.value | number:'1.0-0' }} OMR@if (g.renewal) { · <span class="text-status-amber font-semibold">renewal in progress</span>}</div>
                  </td>
                  @for (m of months; track m) { <td class="px-2.5 py-2 text-right text-xs font-semibold text-ink-700">{{ g.t.month[m] ? (g.t.month[m] | number:'1.0-0') : '—' }}</td> }
                  <td class="px-2.5 py-2 text-right text-xs font-semibold text-brand-700">{{ g.t.forecast | number:'1.0-0' }}</td><td class="px-2.5 py-2 text-right text-xs font-semibold">{{ g.t.actual | number:'1.0-0' }}</td><td class="px-2.5 py-2 text-right text-xs font-bold">{{ g.t.expected | number:'1.0-0' }}</td>
                </tr>
                @for (l of g.lines; track l.r.key) {
                  <tr class="border-t border-surface-border hover:bg-surface-subtle/40">
                    <td class="px-3 py-1.5 sticky left-0 bg-white z-10">
                      <span class="text-ink-800">{{ l.r.line }}</span>
                      @if (l.r.feed; as f) { <a class="ml-1.5 text-[10px] font-bold uppercase text-brand-600 hover:underline" [routerLink]="f.kind === 'Team' ? '/contracts-budget/team-forecast' : '/contracts-budget/transaction-forecast'" title="The forecast of this line comes from the {{ f.kind }} Forecast">{{ f.kind }}</a> }
                    </td>
                    @for (c of l.cells; track $index) {
                      @if (editing() && editable(l.r, c)) {
                        <td class="px-1 py-1"><input type="number" min="0" class="w-[86px] px-1.5 py-1 text-right text-xs rounded border border-brand-200 bg-brand-50 focus:outline-none focus:border-brand-500" [class.chg]="isChanged(l.r.key, $index)"
                          [value]="draftValue(l.r.key, $index, c.forecast)" (input)="setDraft(l.r.key, $index, $any($event.target).value)" /></td>
                      } @else {
                        <td class="px-2.5 py-1.5 text-right whitespace-nowrap" [title]="c.source + (c.renewal ? ' · contract renewal in progress' : '')"
                          [class.text-ink-900]="c.actual" [class.bg-brand-50]="!c.actual && c.value !== null && !c.awaiting" [class.text-brand-700]="!c.actual && c.value !== null && !c.awaiting"
                          [class.bg-amber-50]="c.awaiting" [class.text-status-amber]="c.awaiting" [class.text-ink-300]="c.value === null"
                          [class.ed]="canType(l.r, c)" (click)="canType(l.r, c) && startEdit()">
                          {{ c.value === null ? '—' : (c.value | number:'1.0-0') }}
                        </td>
                      }
                    }
                    <td class="px-2.5 py-1.5 text-right text-brand-700">{{ l.forecast | number:'1.0-0' }}</td><td class="px-2.5 py-1.5 text-right">{{ l.actual | number:'1.0-0' }}</td><td class="px-2.5 py-1.5 text-right font-semibold">{{ l.expected | number:'1.0-0' }}</td>
                  </tr>
                }
              } @empty {
                <tr><td colspan="16" class="px-4 py-10 text-center text-sm text-ink-400">No PO lines match these filters.</td></tr>
              }
            </tbody>
            @if (groups().length) {
              <tfoot><tr class="border-t-2 border-surface-border font-bold bg-surface-subtle/50">
                <td class="px-3 py-2.5 sticky left-0 bg-surface-subtle z-10">Grand total</td>
                @for (m of months; track m) { <td class="px-2.5 py-2.5 text-right">{{ totals().month[m] | number:'1.0-0' }}</td> }
                <td class="px-2.5 py-2.5 text-right text-brand-700">{{ totals().forecast | number:'1.0-0' }}</td><td class="px-2.5 py-2.5 text-right">{{ totals().actual | number:'1.0-0' }}</td><td class="px-2.5 py-2.5 text-right">{{ totals().expected | number:'1.0-0' }}</td>
              </tr></tfoot>
            }
          </table>
        </div>
        <p class="text-xs text-ink-400 mt-3 leading-relaxed">
          Amounts in OMR. <b class="text-ink-700">Black</b> = actual (approved invoice) · <span class="text-brand-700 bg-brand-50 px-1">tinted</span> = forecast · <span class="text-status-amber bg-amber-50 px-1">amber</span> = past month still on forecast because its invoice is not approved yet · — = outside the contract period.
          Hover a month to see its forecast next to the actual. Forecast column = the yearly forecast of every month.
        </p>
      </mat-tab>

      <mat-tab label="Change history ({{ history().length }})">
        <div class="surface-card overflow-x-auto mt-4">
          <table class="crc-table w-full text-sm">
            <thead><tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide"><th class="px-3 py-2.5 font-medium">When</th><th class="px-3 py-2.5 font-medium">By</th><th class="px-3 py-2.5 font-medium">Line</th><th class="px-3 py-2.5 font-medium">Month</th><th class="px-3 py-2.5 font-medium text-right">From</th><th class="px-3 py-2.5 font-medium text-right">To</th><th class="px-3 py-2.5 font-medium">Note</th></tr></thead>
            <tbody>
              @for (e of history(); track e.id) {
                <tr class="border-t border-surface-border"><td class="px-3 py-2 whitespace-nowrap">{{ e.at | date:'d MMM, HH:mm' }}</td><td class="px-3 py-2">{{ e.by }}</td><td class="px-3 py-2">{{ e.item }}</td><td class="px-3 py-2">{{ long[e.month] }}</td><td class="px-3 py-2 text-right">{{ e.from === null ? '—' : (e.from | number:'1.0-3') }}</td><td class="px-3 py-2 text-right font-semibold">{{ e.to | number:'1.0-3' }}</td><td class="px-3 py-2 text-ink-600">{{ e.reason }}</td></tr>
              } @empty { <tr><td colspan="7" class="px-4 py-10 text-center text-sm text-ink-400">The yearly forecast has not been changed yet.</td></tr> }
            </tbody>
          </table>
        </div>
      </mat-tab>
    </mat-tab-group>

    @if (editing()) {
      <div class="savebar sticky -bottom-4 sm:-bottom-6 z-30 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 mt-6 px-4 sm:px-6 py-3 bg-white border-t border-surface-border flex flex-wrap items-center gap-3">
        <span class="inline-flex items-center gap-1.5 text-sm font-semibold" [class.text-status-amber]="changed()" [class.text-ink-500]="!changed()">
          <mat-icon class="!text-lg">{{ changed() ? 'pending' : 'edit_note' }}</mat-icon>{{ changed() ? changed() + ' change' + (changed() === 1 ? '' : 's') + ' not saved yet' : 'No changes yet' }}
        </span>
        <input class="flex-1 min-w-[220px] max-w-md ml-auto px-3 py-2 text-sm rounded-lg border border-surface-border focus:outline-none focus:border-brand-400" placeholder="Note for this forecast, e.g. FY{{ year }} forecast" [value]="note()" (input)="note.set($any($event.target).value)" />
        <button mat-stroked-button (click)="cancel()">Cancel</button>
        <button mat-flat-button color="primary" (click)="save()" [disabled]="!changed()"><mat-icon class="!text-base !mr-1">save</mat-icon>Save forecast</button>
      </div>
    }
  `,
  styles: [`.savebar { box-shadow: 0 -6px 18px -8px rgba(25, 23, 51, .18); } .lbl { font-size: 10.5px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: .04em; } .chg { background: #fffbeb !important; border-color: #f59e0b !important; } .ed { cursor: pointer; } .ed:hover { outline: 1px solid #fb923c; outline-offset: -1px; }`],
})
export class AccrualForecastComponent {
  store = inject(CrcStore);
  svc = inject(ForecastService);
  private ui = inject(UiService);

  field = FIELD;
  year = FY_YEAR;
  months = MONTHS;
  cur = CUR_MONTH;
  short = MONTH_SHORT;
  long = MONTH_LONG;

  vendor = signal('Infoline LLC');
  contract = signal('All');
  type = signal('All');
  q = signal('');

  editing = signal(false);
  note = signal('');
  draft = signal<Record<string, Record<number, number>>>({});

  vendors = computed(() => [...new Set(this.svc.accrualRows().map((r) => r.vendor))]);
  contracts = computed(() => [...new Set(this.svc.accrualRows().filter((r) => this.vendor() === 'All' || r.vendor === this.vendor()).map((r) => r.contract.reference))]);
  types = computed(() => [...new Set(this.svc.accrualRows().map((r) => r.contract.contractType))]);

  filtered = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.svc.accrualRows().filter((r) => (this.vendor() === 'All' || r.vendor === this.vendor()) && (this.contract() === 'All' || r.contract.reference === this.contract()) && (this.type() === 'All' || r.contract.contractType === this.type()) && (!q || r.line.toLowerCase().includes(q)));
  });

  private lines = computed<Line[]>(() => this.filtered().map((r) => {
    const cells = MONTHS.map((m) => this.svc.cell(r, m));
    const actual = cells.filter((c) => c.actual).reduce((s, c) => s + (c.value ?? 0), 0);
    const remaining = cells.filter((c) => !c.actual).reduce((s, c) => s + (c.value ?? 0), 0);
    return { r, cells, forecast: cells.reduce((s, c) => s + (c.forecast ?? 0), 0), actual, expected: actual + remaining };
  }));

  groups = computed(() => {
    const out: Array<{ ref: string; vendor: string; po: string; from: string; to: string; value: number; renewal: boolean; lines: Line[]; t: Totals }> = [];
    for (const l of this.lines()) {
      let g = out.find((x) => x.ref === l.r.contract.reference);
      if (!g) { const c = l.r.contract; g = { ref: c.reference, vendor: l.r.vendor, po: l.r.po, from: c.startDate, to: c.endDate, value: c.amount, renewal: c.renewalStatus === 'Renewal in progress', lines: [], t: totalsOf([]) }; out.push(g); }
      g.lines.push(l);
    }
    for (const g of out) g.t = totalsOf(g.lines);
    return out;
  });

  totals = computed(() => totalsOf(this.lines()));
  variance = computed(() => this.totals().actual - this.totals().actualForecast);
  variancePct = computed(() => (this.totals().actualForecast ? (this.variance() / this.totals().actualForecast) * 100 : 0));
  history = computed(() => this.svc.edits().filter((e) => e.kind === 'Accrual'));
  changed = computed(() => Object.values(this.draft()).reduce((n, d) => n + Object.keys(d).length, 0));

  editable = (r: AccrualRow, c: AccrualCell) => !r.feed && !c.actual && c.value !== null;
  canType = (r: AccrualRow, c: AccrualCell) => !this.editing() && this.editable(r, c) && this.store.can('Edit Forecast');
  draftValue = (key: string, m: number, current: number | null) => this.draft()[key]?.[m] ?? current ?? '';
  isChanged = (key: string, m: number) => this.draft()[key]?.[m] !== undefined;

  setDraft(key: string, m: number, raw: string) {
    const row = this.svc.accrualRows().find((r) => r.key === key)!;
    const current = this.svc.forecastOf(row, m);
    const v = raw === '' ? null : Number(raw);
    this.draft.update((d) => {
      const next = { ...d, [key]: { ...(d[key] ?? {}) } };
      if (v === null || v === current) delete next[key][m]; else next[key][m] = v;
      if (!Object.keys(next[key]).length) delete next[key];
      return next;
    });
  }

  clear() { this.vendor.set('Infoline LLC'); this.contract.set('All'); this.type.set('All'); this.q.set(''); }
  startEdit() { if (this.ui.requires('Edit Forecast')) { this.draft.set({}); this.note.set(''); this.editing.set(true); } }
  cancel() { this.draft.set({}); this.editing.set(false); }

  save() {
    const rows = this.svc.accrualRows();
    const changes = Object.entries(this.draft()).flatMap(([key, ms]) => Object.entries(ms).map(([m, value]) => ({ r: rows.find((x) => x.key === key)!, m: Number(m), value })));
    const err = this.svc.setPlan(changes, this.note());
    if (err) { this.ui.toast(err, 5000); return; }
    this.ui.toast(`Forecast saved: ${changes.length} figure(s).`);
    this.cancel();
  }
}
