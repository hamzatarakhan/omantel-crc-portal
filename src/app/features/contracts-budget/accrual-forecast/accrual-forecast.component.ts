import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { RequiresDirective } from '../../../shared/directives/requires.directive';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { AccrualCell, AccrualRow, ForecastService } from '../../../core/services/forecast.service';

const FIELD = 'w-full px-2.5 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 focus:outline-none focus:border-brand-400';
interface Line { r: AccrualRow; cells: AccrualCell[]; forecast: number; actual: number; expected: number; remaining: number; over: boolean }
interface Totals { month: number[]; forecast: number; actual: number; expected: number; actualForecast: number; budget: number; remaining: number }

const totalsOf = (ls: Line[]): Totals => {
  const n = ls[0]?.cells.length ?? 0;
  return {
    month: Array.from({ length: n }, (_, m) => ls.reduce((s, l) => s + (l.cells[m].value ?? 0), 0)),
    forecast: ls.reduce((s, l) => s + l.forecast, 0),
    actual: ls.reduce((s, l) => s + l.actual, 0),
    expected: ls.reduce((s, l) => s + l.expected, 0),
    actualForecast: ls.reduce((s, l) => s + l.cells.filter((c) => c.actual).reduce((x, c) => x + (c.forecast ?? 0), 0), 0),
    budget: ls.reduce((s, l) => s + l.r.budget, 0),
    remaining: ls.reduce((s, l) => s + l.remaining, 0),
  };
};

/**
 * "Per Line": the yearly forecast is entered once per line and month; each month switches to the approved invoice amount
 * as soon as the invoice is approved in Reconciliation, and the forecast stays for comparison.
 */
@Component({
  selector: 'app-accrual-forecast',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatTabsModule, PageHeaderComponent, KpiCardComponent, RequiresDirective],
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
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
        <label class="block"><span class="lbl">Vendor</span>
          <select [class]="field + ' mt-1'" (change)="vendor.set($any($event.target).value)">
            <option value="All" [selected]="vendor() === 'All'">All vendors</option>
            @for (v of vendors(); track v) { <option [value]="v" [selected]="v === vendor()">{{ v }}</option> }
          </select></label>
        <label class="block"><span class="lbl">Contract</span>
          <select [class]="field + ' mt-1'" (change)="contract.set($any($event.target).value)">
            @for (c of contracts(); track c) { <option [value]="c" [selected]="c === contract()">{{ c }}</option> }
          </select></label>
        <label class="block"><span class="lbl">Year of budget</span>
          <select [class]="field + ' mt-1'" (change)="yearFilter.set(+$any($event.target).value)">
            @for (y of years(); track y.year) { <option [value]="y.year" [selected]="y.year === yearFilter()">{{ y.label }}</option> }
          </select></label>
        <label class="block"><span class="lbl">Contract type</span>
          <select [class]="field + ' mt-1'" (change)="type.set($any($event.target).value)">
            <option value="All">All types</option>
            @for (t of types(); track t) { <option [value]="t" [selected]="t === type()">{{ t }}</option> }
          </select></label>
        <label class="block"><span class="lbl">Yearly budget line</span>
          <select [class]="field + ' mt-1'" (change)="lineFilter.set($any($event.target).value)">
            <option value="All" [selected]="lineFilter() === 'All'">All lines</option>
            @for (l of lines(); track l) { <option [value]="l" [selected]="l === lineFilter()">{{ l }}</option> }
          </select></label>
      </div>
      <div class="flex justify-end mt-2.5 text-xs"><button (click)="clear()" class="font-semibold text-brand-700 hover:underline">Clear filters</button></div>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
      <app-kpi-card [label]="'Forecast — ' + (yearHeading() || 'this year')" [value]="totals().forecast | number:'1.0-0'" unit="OMR" icon="edit_calendar" level="info"></app-kpi-card>
      <app-kpi-card label="Actual — approved invoices" [value]="totals().actual | number:'1.0-0'" unit="OMR" icon="receipt_long" level="normal"></app-kpi-card>
      <app-kpi-card label="Remaining forecast" [value]="(totals().expected - totals().actual) | number:'1.0-0'" unit="OMR" icon="query_stats"></app-kpi-card>
      <app-kpi-card label="Expected year total" [value]="totals().expected | number:'1.0-0'" unit="OMR" icon="functions"></app-kpi-card>
    </div>
    <p class="text-xs text-ink-500 mb-4 px-1">
      On the months already invoiced, actual is <b [class.text-status-red]="variance() > 0" [class.text-status-green]="variance() < 0">{{ variance() > 0 ? '+' : '' }}{{ variance() | number:'1.0-0' }} OMR</b>
      ({{ variancePct() | number:'1.1-1' }}%) against the forecast. Expected year total = approved invoices + the forecast of the months not invoiced yet.
    </p>

    @if (pace().checked) {
      <div class="surface-card px-4 py-3 mb-4 border-l-4" [class.!border-l-status-red]="pace().short.length" [class.!border-l-status-green]="!pace().short.length">
        <div class="flex items-start gap-3">
          <mat-icon [class.text-status-red]="pace().short.length" [class.text-status-green]="!pace().short.length">{{ pace().short.length ? 'trending_down' : 'verified' }}</mat-icon>
          <div class="flex-1 text-sm text-ink-700">
            @if (pace().short.length) {
              <b class="text-status-red">{{ pace().short.length }} of {{ pace().checked }} line(s) will NOT have enough budget</b> if they keep spending at their current pace
              (the average of their invoiced months so far).
              <div class="flex flex-wrap gap-1.5 mt-2">
                @for (x of pace().short.slice(0, 8); track x.id) {
                  <span class="text-xs px-2 py-1 rounded-md bg-red-50 text-status-red border border-red-100" [title]="x.message"><b>{{ x.line }}</b> — {{ x.label }}</span>
                }
                @if (pace().short.length > 8) { <span class="text-xs px-2 py-1 text-ink-500">+{{ pace().short.length - 8 }} more (see the badges in the table)</span> }
              </div>
            } @else {
              <b class="text-status-green">Every line has enough budget</b> for its remaining months at its current pace (the average of its invoiced months so far).
            }
          </div>
        </div>
      </div>
    }

    <mat-tab-group>
      <mat-tab label="Per line">
        <div class="surface-card overflow-x-auto mt-4">
          <table class="crc-table w-full text-sm">
            <thead><tr class="bg-surface-subtle text-left text-[11px] text-ink-500 uppercase tracking-wide">
              <th class="px-3 py-2.5 font-medium sticky left-0 bg-surface-subtle min-w-[240px] z-10">Yearly budget line</th>
              @for (m of monthCols(); track m) { <th class="px-2.5 py-2.5 font-medium text-right whitespace-nowrap">{{ svc.monthShortLabel(m) }}</th> }
              <th class="px-2.5 py-2.5 font-medium text-right">Forecast</th><th class="px-2.5 py-2.5 font-medium text-right">Actual</th><th class="px-2.5 py-2.5 font-medium text-right">Expected</th><th class="px-2.5 py-2.5 font-medium text-right">Budget</th><th class="px-2.5 py-2.5 font-medium text-right">Remaining</th>
            </tr></thead>
            <tbody>
              @for (g of groups(); track g.ref) {
                <tr class="border-t-2 border-surface-border bg-surface-subtle/60">
                  <td class="px-3 py-2 sticky left-0 bg-surface-subtle z-10">
                    <div class="font-semibold text-ink-900">{{ g.vendor }}</div>
                    <div class="text-[11px] text-ink-500">{{ g.ref }} · PO {{ g.po || '—' }} · {{ g.from }} → {{ g.to }} · value {{ g.value | number:'1.0-0' }} OMR@if (g.renewal) { · <span class="text-status-amber font-semibold">renewal in progress</span>}</div>
                  </td>
                  @for (m of monthCols(); track m; let i = $index) { <td class="px-2.5 py-2 text-right text-xs font-semibold text-ink-700">{{ g.t.month[i] ? (g.t.month[i] | number:'1.0-0') : '—' }}</td> }
                  <td class="px-2.5 py-2 text-right text-xs font-semibold text-brand-700">{{ g.t.forecast | number:'1.0-0' }}</td><td class="px-2.5 py-2 text-right text-xs font-semibold">{{ g.t.actual | number:'1.0-0' }}</td><td class="px-2.5 py-2 text-right text-xs font-bold">{{ g.t.expected | number:'1.0-0' }}</td>
                  <td class="px-2.5 py-2 text-right text-xs font-semibold text-ink-500">{{ g.t.budget | number:'1.0-0' }}</td><td class="px-2.5 py-2 text-right text-xs font-bold" [class.text-status-red]="g.t.remaining < 0">{{ g.t.remaining | number:'1.0-0' }}</td>
                </tr>
                @for (l of g.lines; track l.r.id) {
                  <tr class="border-t border-surface-border hover:bg-surface-subtle/40">
                    <td class="px-3 py-1.5 sticky left-0 bg-white z-10">
                      <div class="text-ink-800">{{ l.r.line }}</div>
                      <div class="text-[10px] text-ink-400">{{ l.r.yearLabel.split(' — ')[0] }} · expires in {{ svc.monthsUntilExpiry(l.r) }} mo</div>
                      @if (paceBadge(l.r); as b) {
                        <span class="mt-1 inline-flex items-center gap-1 text-[10.5px] font-semibold px-1.5 py-0.5 rounded" [class.bg-red-50]="b.short" [class.text-status-red]="b.short" [class.bg-green-50]="!b.short" [class.text-status-green]="!b.short" [title]="b.message">
                          <mat-icon class="!text-[13px] !w-[13px] !h-[13px]">{{ b.short ? 'trending_down' : 'check_circle' }}</mat-icon>{{ b.label }}
                        </span>
                      }
                    </td>
                    @for (m of monthCols(); track m; let i = $index) {
                      @if (editing() && editable(l.r, l.cells[i])) {
                        <td class="px-1 py-1"><input type="number" min="0" class="w-[86px] px-1.5 py-1 text-right text-xs rounded border border-brand-200 bg-brand-50 focus:outline-none focus:border-brand-500" [class.chg]="isChanged(l.r.key, m)"
                          [value]="draftValue(l.r.key, m, l.cells[i].forecast)" (input)="setDraft(l.r.key, m, $any($event.target).value)" /></td>
                      } @else {
                        <td class="px-2.5 py-1.5 text-right whitespace-nowrap" [title]="l.cells[i].source"
                          [class.text-ink-900]="l.cells[i].actual" [class.bg-brand-50]="!l.cells[i].actual && !l.cells[i].awaiting" [class.text-brand-700]="!l.cells[i].actual && !l.cells[i].awaiting"
                          [class.bg-amber-50]="l.cells[i].awaiting" [class.text-status-amber]="l.cells[i].awaiting"
                          [class.ed]="canType(l.r, l.cells[i])" (click)="canType(l.r, l.cells[i]) && startEdit()">
                          {{ l.cells[i].value === null ? '—' : (l.cells[i].value | number:'1.0-0') }}
                        </td>
                      }
                    }
                    <td class="px-2.5 py-1.5 text-right text-brand-700">{{ l.forecast | number:'1.0-0' }}</td><td class="px-2.5 py-1.5 text-right">{{ l.actual | number:'1.0-0' }}</td><td class="px-2.5 py-1.5 text-right font-semibold">{{ l.expected | number:'1.0-0' }}</td>
                    <td class="px-2.5 py-1.5 text-right text-ink-500">{{ l.r.budget | number:'1.0-0' }}</td>
                    <td class="px-2.5 py-1.5 text-right">
                      <div class="font-semibold" [class.text-status-red]="l.remaining < 0" [class.text-status-green]="l.remaining >= 0">{{ l.remaining | number:'1.0-0' }}</div>
                      @if (svc.runRate(l.r); as rr) {
                        <div class="text-[10px] inline-flex items-center gap-0.5" [class.text-status-red]="rr.over" [class.text-status-normal]="!rr.over" [title]="rr.message">
                          <mat-icon class="!text-xs !w-3 !h-3">{{ rr.over ? 'warning' : 'trending_flat' }}</mat-icon>{{ rr.over ? 'at risk' : 'on track' }}
                        </div>
                      }
                    </td>
                  </tr>
                }
              } @empty {
                <tr><td [attr.colspan]="monthCols().length + 6" class="px-4 py-10 text-center text-sm text-ink-400">No yearly budget lines match these filters.</td></tr>
              }
            </tbody>
            @if (groups().length) {
              <tfoot><tr class="border-t-2 border-surface-border font-bold bg-surface-subtle/50">
                <td class="px-3 py-2.5 sticky left-0 bg-surface-subtle z-10">Grand total</td>
                @for (m of monthCols(); track m; let i = $index) { <td class="px-2.5 py-2.5 text-right">{{ totals().month[i] | number:'1.0-0' }}</td> }
                <td class="px-2.5 py-2.5 text-right text-brand-700">{{ totals().forecast | number:'1.0-0' }}</td><td class="px-2.5 py-2.5 text-right">{{ totals().actual | number:'1.0-0' }}</td><td class="px-2.5 py-2.5 text-right">{{ totals().expected | number:'1.0-0' }}</td>
                <td class="px-2.5 py-2.5 text-right text-ink-500">{{ totals().budget | number:'1.0-0' }}</td><td class="px-2.5 py-2.5 text-right" [class.text-status-red]="totals().remaining < 0">{{ totals().remaining | number:'1.0-0' }}</td>
              </tr></tfoot>
            }
          </table>
        </div>
        <p class="text-xs text-ink-400 mt-3 leading-relaxed">
          Amounts in OMR. <b class="text-ink-700">Black</b> = actual (approved invoice) · <span class="text-brand-700 bg-brand-50 px-1">tinted</span> = forecast · <span class="text-status-amber bg-amber-50 px-1">amber</span> = past month still on forecast because its invoice is not approved yet.
          Months shown are this line's own Year of budget, selected above. Hover a month to see its forecast next to the actual. Budget = the line's approved Yearly Budget amount; Remaining = Budget − actual/forecast so far. "At risk" projects the remaining months at the actual-so-far monthly average.
        </p>
      </mat-tab>

      <mat-tab label="Change history ({{ history().length }})">
        <div class="surface-card overflow-x-auto mt-4">
          <table class="crc-table w-full text-sm">
            <thead><tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide"><th class="px-3 py-2.5 font-medium">When</th><th class="px-3 py-2.5 font-medium">By</th><th class="px-3 py-2.5 font-medium">Line</th><th class="px-3 py-2.5 font-medium">Month</th><th class="px-3 py-2.5 font-medium text-right">From</th><th class="px-3 py-2.5 font-medium text-right">To</th><th class="px-3 py-2.5 font-medium">Note</th></tr></thead>
            <tbody>
              @for (e of history(); track e.id) {
                <tr class="border-t border-surface-border"><td class="px-3 py-2 whitespace-nowrap">{{ e.at | date:'d MMM, HH:mm' }}</td><td class="px-3 py-2">{{ e.by }}</td><td class="px-3 py-2">{{ e.item }}</td><td class="px-3 py-2">{{ svc.monthLabelOf(e.month) }}</td><td class="px-3 py-2 text-right">{{ e.from === null ? '—' : (e.from | number:'1.0-3') }}</td><td class="px-3 py-2 text-right font-semibold">{{ e.to | number:'1.0-3' }}</td><td class="px-3 py-2 text-ink-600">{{ e.reason }}</td></tr>
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
        <span class="text-xs text-ink-400">Months with an approved invoice are locked.</span>
        @if (overBudget()) { <span class="text-xs font-semibold text-status-red inline-flex items-center gap-1"><mat-icon class="!text-base">error</mat-icon>This change pushes a line further over its approved budget — reduce it before saving.</span> }
        <input class="flex-1 min-w-[220px] max-w-md ml-auto px-3 py-2 text-sm rounded-lg border border-surface-border focus:outline-none focus:border-brand-400" placeholder="Note for this forecast (reason for the change)" [value]="note()" (input)="note.set($any($event.target).value)" />
        <button mat-stroked-button (click)="cancel()">Cancel</button>
        <button mat-flat-button color="primary" (click)="save()" [disabled]="!changed() || overBudget()"><mat-icon class="!text-base !mr-1">save</mat-icon>Save forecast</button>
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

  vendor = signal('Infoline LLC');
  contract = signal('');
  yearFilter = signal<number | null>(null);
  type = signal('All');
  lineFilter = signal('All');

  editing = signal(false);
  note = signal('');
  draft = signal<Record<string, Record<string, number>>>({});

  vendors = computed(() => [...new Set(this.svc.accrualRows().map((r) => r.vendor))]);
  contracts = computed(() => [...new Set(this.svc.accrualRows().filter((r) => this.vendor() === 'All' || r.vendor === this.vendor()).map((r) => r.contract.reference))]);
  types = computed(() => [...new Set(this.svc.accrualRows().map((r) => r.contract.contractType))]);
  /** Distinct yearly-budget line descriptions of the selected contract, for the "Yearly budget line" filter. */
  lines = computed(() => [...new Set(this.svc.accrualRows().filter((r) => r.contract.reference === this.contract()).map((r) => r.line))]);
  /** The selected contract's contract-years (Year 1 of 2, Year 2 of 2, ...) for the mandatory "Year of budget" filter. */
  years = computed(() => {
    const map = new Map<number, string>();
    for (const r of this.svc.accrualRows()) if (r.contract.reference === this.contract() && !map.has(r.year)) map.set(r.year, r.yearLabel.split(' — ')[0]);
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([year, label]) => ({ year, label }));
  });
  yearHeading = computed(() => this.years().find((y) => y.year === this.yearFilter())?.label ?? '');

  constructor() {
    effect(() => { const list = this.contracts(); if (!list.includes(this.contract())) this.contract.set(list[0] ?? ''); }, { allowSignalWrites: true });
    effect(() => { if (this.lineFilter() !== 'All' && !this.lines().includes(this.lineFilter())) this.lineFilter.set('All'); }, { allowSignalWrites: true });
    // No "all years" option — default to the year running today, else the most recent one.
    effect(() => {
      const list = this.years();
      if (list.some((y) => y.year === this.yearFilter())) return;
      const today = new Date().toISOString().slice(0, 10);
      const current = this.svc.accrualRows().find((r) => r.contract.reference === this.contract() && r.yearFrom <= today && r.yearTo >= today);
      this.yearFilter.set(current?.year ?? list[list.length - 1]?.year ?? null);
    }, { allowSignalWrites: true });
  }

  /** The real calendar months of the selected (contract, year) — every visible line shares this same span. */
  monthCols = computed(() => {
    const r = this.svc.accrualRows().find((x) => x.contract.reference === this.contract() && x.year === this.yearFilter());
    return r ? this.svc.monthsOf(r) : [];
  });

  filtered = computed(() => {
    return this.svc.accrualRows().filter((r) => (this.vendor() === 'All' || r.vendor === this.vendor()) && r.contract.reference === this.contract() && r.year === this.yearFilter() && (this.type() === 'All' || r.contract.contractType === this.type()) && (this.lineFilter() === 'All' || r.line === this.lineFilter()));
  });

  /** Pace check of one line: at the average of its invoiced months, is the approved budget enough for the months still open? */
  paceBadge(r: AccrualRow): { short: boolean; label: string; message: string } | null {
    const p = this.svc.pace(r);
    if (p.avg === null) return null;
    const f = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 0 });
    const message = this.svc.runRate(r)?.message ?? `Invoiced ${f(p.spent)} of ${f(r.budget)} OMR approved.`;
    if (p.status === 'ok') return { short: false, label: p.open ? 'Enough at current pace' : 'Within budget', message };
    if (!p.open) return { short: true, label: `Over budget by ${f(-p.left)} OMR`, message };
    if (p.left < -0.001) return { short: true, label: `Budget already used up (${f(-p.left)} OMR over)`, message };
    return { short: true, label: `Runs out ${this.svc.monthShortLabel(p.runsOut!)} · short ${f(-p.gap!)} OMR`, message };
  }

  pace = computed(() => {
    const checked = this.filtered().filter((r) => this.svc.pace(r).avg !== null);
    const short = checked.map((r) => ({ r, b: this.paceBadge(r)! })).filter((x) => x.b.short).map((x) => ({ id: x.r.id, line: x.r.line, label: x.b.label, message: x.b.message }));
    return { checked: checked.length, short };
  });

  private rows = computed<Line[]>(() => this.filtered().map((r) => {
    const cells = this.svc.monthsOf(r).map((m) => this.svc.cell(r, m));
    const actual = cells.filter((c) => c.actual).reduce((s, c) => s + (c.value ?? 0), 0);
    const remainingMonths = cells.filter((c) => !c.actual).reduce((s, c) => s + (c.value ?? 0), 0);
    const before = this.svc.remainingWithDraft(r);
    const remaining = this.svc.remainingWithDraft(r, this.draft()[r.key]);
    const over = remaining < before - 0.001 && remaining < -0.001;
    return { r, cells, forecast: cells.reduce((s, c) => s + (c.forecast ?? 0), 0), actual, expected: actual + remainingMonths, remaining, over };
  }));

  groups = computed(() => {
    const out: Array<{ ref: string; vendor: string; po: string; from: string; to: string; value: number; renewal: boolean; lines: Line[]; t: Totals }> = [];
    for (const l of this.rows()) {
      let g = out.find((x) => x.ref === l.r.contract.reference);
      if (!g) { const c = l.r.contract; g = { ref: c.reference, vendor: l.r.vendor, po: l.r.po, from: c.startDate, to: c.endDate, value: c.amount, renewal: c.renewalStatus === 'Renewal in progress', lines: [], t: totalsOf([]) }; out.push(g); }
      g.lines.push(l);
    }
    for (const g of out) g.t = totalsOf(g.lines);
    return out;
  });

  totals = computed(() => totalsOf(this.rows()));
  variance = computed(() => this.totals().actual - this.totals().actualForecast);
  variancePct = computed(() => (this.totals().actualForecast ? (this.variance() / this.totals().actualForecast) * 100 : 0));
  history = computed(() => this.svc.edits().filter((e) => e.kind === 'Accrual'));
  changed = computed(() => Object.values(this.draft()).reduce((n, d) => n + Object.keys(d).length, 0));
  overBudget = computed(() => this.rows().some((l) => l.over));

  editable = (_r: AccrualRow, c: AccrualCell) => !c.actual;
  canType = (r: AccrualRow, c: AccrualCell) => !this.editing() && this.editable(r, c) && this.store.can('Edit Forecast');
  draftValue = (key: string, m: string, current: number | null) => this.draft()[key]?.[m] ?? current ?? '';
  isChanged = (key: string, m: string) => this.draft()[key]?.[m] !== undefined;

  setDraft(key: string, m: string, raw: string) {
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

  clear() { this.vendor.set('Infoline LLC'); this.contract.set(''); this.yearFilter.set(null); this.type.set('All'); this.lineFilter.set('All'); }
  startEdit() { if (this.ui.requires('Edit Forecast')) { this.draft.set({}); this.note.set(''); this.editing.set(true); } }
  cancel() { this.draft.set({}); this.editing.set(false); }

  save() {
    const changes = Object.entries(this.draft()).flatMap(([key, ms]) => Object.entries(ms).map(([m, value]) => ({ r: this.svc.rowFor(key, m)!, m, value })));
    const err = this.svc.setPlan(changes, this.note());
    if (err) { this.ui.toast(err, 5000); return; }
    this.ui.toast(`Forecast saved: ${changes.length} figure(s).`);
    this.cancel();
  }
}
