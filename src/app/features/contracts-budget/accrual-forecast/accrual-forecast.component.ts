import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { RequiresDirective } from '../../../shared/directives/requires.directive';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { DIALOG_SIZE } from '../../../shared/dialog-sizes';
import { ACCRUAL_LEVEL, ACCRUAL_STATUSES, AccrualCell, AccrualForecast, AccrualLine, COMPS, COMP_LABEL, CUR_MONTH, FY_LABEL, FY_YEAR, MONTH_LONG, MONTH_SHORT } from '../../../core/services/forecast.service';
import { AccrualDetailDialogComponent } from './accrual-detail-dialog.component';

const FIELD = 'w-full px-2.5 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 focus:outline-none focus:border-brand-400';
const num = (v: any) => Number(v ?? 0) || 0;

interface Row { line: AccrualLine; cell?: AccrualCell; applicable: boolean; status: string; invoice: string; t: ReturnType<AccrualForecast['totals']> | null }

@Component({
  selector: 'app-accrual-forecast',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule, MatTabsModule, PageHeaderComponent, KpiCardComponent, StatusChipComponent, RequiresDirective],
  template: `
    <app-page-header
      title="Accrual Forecast"
      subtitle="The expected cost of each outsourcing contract, month by month. Forecast amounts are replaced by the real invoice amount once the invoice is approved."
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Forecast' }, { label: 'Accrual Forecast' }]"
    >
      <button mat-stroked-button (click)="generate()" appRequires="Edit Accrual Forecast"><mat-icon class="!text-base !mr-1">autorenew</mat-icon>Generate forecast</button>
      @if (svc.settings().lockAfter === 'Finance approval') { <button mat-stroked-button (click)="approve()" appRequires="Close Forecast Period"><mat-icon class="!text-base !mr-1">verified</mat-icon>Approve period</button> }
      <button mat-stroked-button (click)="close()" appRequires="Close Forecast Period"><mat-icon class="!text-base !mr-1">lock</mat-icon>Close period</button>
      <button mat-flat-button color="primary" (click)="exportExcel()" appRequires="Export Forecast"><mat-icon class="!text-base !mr-1">download</mat-icon>Export to Excel</button>
    </app-page-header>

    @if (svc.pending(); as p) {
      <div class="surface-card px-4 py-3 mb-4 flex items-center gap-3 border-l-4 !border-l-status-amber"><mat-icon class="text-status-amber">hourglass_top</mat-icon>
        <div class="flex-1 text-sm text-ink-700">The scheduled forecast for <b>{{ p }}</b> is waiting for a confirmation.</div>
        <button mat-flat-button color="primary" (click)="confirmGeneration()" appRequires="Edit Accrual Forecast">Confirm generation</button></div>
    }
    @if (svc.closure(); as cl) {
      <div class="surface-card px-4 py-3 mb-4 flex items-center gap-3 border-l-4 !border-l-status-amber"><mat-icon class="text-status-amber">event_busy</mat-icon>
        <div class="flex-1 text-sm text-ink-700"><b>{{ cl.label }}</b> is not closed yet. {{ cl.days < 0 ? 'Its closing day (' + svc.settings().closeByDay + ') has passed.' : 'It should be closed by day ' + svc.settings().closeByDay + ' (' + cl.days + ' day(s) left).' }}</div>
        <button mat-stroked-button (click)="month.set(cl.month)">Show it</button></div>
    }

    <div class="surface-card px-4 py-3.5 mb-4">
      <div class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2.5">
        @for (f of selects(); track f.key) {
          <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">{{ f.label }}</span>
            <select [class]="field + ' mt-1'" (change)="f.set($any($event.target).value)">
              @for (o of f.options; track o.value) { <option [value]="o.value" [selected]="o.value === (f.value() + '')">{{ o.label }}</option> }
            </select>
          </label>
        }
      </div>
      <div class="flex items-center justify-between mt-2.5 text-xs text-ink-400">
        <span>Next automatic generation: <b class="text-ink-600">{{ svc.nextRun() }}</b> · <a class="text-brand-600 font-medium" routerLink="/contracts-budget/forecast-settings" appRequires="Configure Forecast">Change settings</a></span>
        <button (click)="clear()" class="font-semibold text-brand-700 hover:underline">Clear filters</button>
      </div>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
      <app-kpi-card label="Total forecast" [value]="summary().forecast | number:'1.0-0'" unit="OMR" icon="query_stats"></app-kpi-card>
      <app-kpi-card label="Total actual" [value]="summary().actual | number:'1.0-0'" unit="OMR" icon="receipt_long" level="normal"></app-kpi-card>
      <app-kpi-card label="Total variance" [value]="(summary().variance > 0 ? '+' : '') + (summary().variance | number:'1.0-0')" unit="OMR" icon="compare_arrows" [level]="summary().flagged ? 'red' : 'neutral'"></app-kpi-card>
      <app-kpi-card label="Active contracts" [value]="summary().contracts" icon="description"></app-kpi-card>
    </div>
    <p class="text-xs text-ink-500 mb-4 px-1">
      <b class="text-ink-700">{{ summary().lines }}</b> forecasted lines · <b class="text-ink-700">{{ summary().actualized }}</b> actualized · <b class="text-ink-700">{{ summary().manual }}</b> manually updated for {{ monthName() }} {{ year }}
    </p>

    <mat-tab-group>
      <mat-tab label="{{ monthName() }} forecast">
        <div class="surface-card overflow-x-auto mt-4">
          <table class="crc-table w-full text-sm">
            <thead><tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide">
              <th class="px-3 py-2.5 w-8"></th><th class="px-3 py-2.5 font-medium">Vendor</th><th class="px-3 py-2.5 font-medium">Contract</th><th class="px-3 py-2.5 font-medium">Resource category</th>
              <th class="px-3 py-2.5 font-medium text-right">Resources</th><th class="px-3 py-2.5 font-medium text-right">Salary</th><th class="px-3 py-2.5 font-medium text-right">Overtime</th><th class="px-3 py-2.5 font-medium text-right">{{ svc.settings().performanceLabel }}</th>
              <th class="px-3 py-2.5 font-medium text-right">Forecast</th><th class="px-3 py-2.5 font-medium text-right">Actual</th><th class="px-3 py-2.5 font-medium text-right">Variance</th><th class="px-3 py-2.5 font-medium">Status</th><th class="px-3 py-2.5 font-medium text-right">Actions</th>
            </tr></thead>
            <tbody>
              @for (r of rows(); track r.line.id) {
                <tr class="border-t border-surface-border hover:bg-surface-subtle/60" [class.opacity-60]="!r.applicable">
                  <td class="px-3 py-2.5"><button class="w-6 h-6 rounded flex items-center justify-center text-ink-400 hover:bg-surface-subtle" (click)="toggle(r.line.id)" title="Show the monthly breakdown"><mat-icon class="!text-lg">{{ open().has(r.line.id) ? 'expand_more' : 'chevron_right' }}</mat-icon></button></td>
                  <td class="px-3 py-2.5 font-medium text-ink-900">{{ r.line.vendor }}</td>
                  <td class="px-3 py-2.5 text-ink-700"><div>{{ r.line.contract }}</div><div class="text-[11px] text-ink-400">{{ r.line.contractStatus }} · ends {{ r.line.endDate }}</div></td>
                  <td class="px-3 py-2.5 text-ink-700">{{ r.line.category }}</td>
                  <td class="px-3 py-2.5 text-right">{{ r.cell ? r.cell.hc : '—' }}</td>
                  <td class="px-3 py-2.5 text-right">{{ r.cell ? (svc.shown(r.cell, 'salary') | number:'1.0-0') : '—' }}</td>
                  <td class="px-3 py-2.5 text-right">{{ r.cell ? (svc.shown(r.cell, 'overtime') | number:'1.0-0') : '—' }}</td>
                  <td class="px-3 py-2.5 text-right">{{ r.cell ? (svc.shown(r.cell, 'performance') | number:'1.0-0') : '—' }}</td>
                  <td class="px-3 py-2.5 text-right font-medium">{{ r.t ? (r.t.forecast | number:'1.0-0') : '—' }}</td>
                  <td class="px-3 py-2.5 text-right font-medium">{{ r.t && r.t.actual !== null ? (r.t.actual | number:'1.0-0') : '—' }}</td>
                  <td class="px-3 py-2.5 text-right" [class.text-status-red]="r.t?.flagged" [class.font-semibold]="r.t?.flagged">{{ r.t && r.t.variance !== null ? ((r.t.variance > 0 ? '+' : '') + (r.t.variance | number:'1.0-0') + ' (' + (r.t.pct | number:'1.1-1') + '%)') : '—' }}</td>
                  <td class="px-3 py-2.5"><app-status-chip [label]="r.status" [level]="level(r.status)"></app-status-chip></td>
                  <td class="px-3 py-2.5">
                    <div class="flex items-center justify-end gap-0.5">
                      <button class="act" title="View details and adjustment history" (click)="detail(r.line.id)"><mat-icon>visibility</mat-icon></button>
                      @if (r.cell && svc.canEdit(r.cell) && store.can('Edit Accrual Forecast')) {
                        <button class="act" title="Edit the current-month forecast" (click)="edit(r)"><mat-icon>edit</mat-icon></button>
                        <button class="act" title="Recalculate from the latest data" (click)="recalc(r)"><mat-icon>sync</mat-icon></button>
                      }
                      @if (r.cell?.invoice) { <button class="act" title="View invoice {{ r.cell?.invoice?.ref }}" (click)="viewInvoice()"><mat-icon>receipt_long</mat-icon></button> }
                    </div>
                  </td>
                </tr>
                @if (open().has(r.line.id)) {
                  <tr class="bg-surface-subtle/50 border-t border-surface-border">
                    <td></td>
                    <td colspan="12" class="px-3 py-3">
                      <div class="text-[11px] font-bold uppercase tracking-wide text-ink-400 mb-2">Monthly breakdown — {{ r.line.category }} · {{ year }}</div>
                      <div class="grid grid-cols-6 md:grid-cols-12 gap-2">
                        @for (m of months; track m.i) {
                          <button class="rounded-lg border border-surface-border bg-white px-2 py-1.5 text-left hover:border-brand-300" [class.ring-2]="m.i === month()" [class.ring-brand-300]="m.i === month()" (click)="month.set(m.i)" title="Show {{ m.long }}">
                            <div class="text-[10px] font-bold text-ink-400 uppercase">{{ m.short }}</div>
                            @if (svc.cell(r.line.id, m.i); as c) {
                              <div class="text-xs font-semibold" [class.text-ink-900]="tag(c) !== 'F'" [class.text-ink-400]="tag(c) === 'F'">{{ svc.shownTotal(c) | number:'1.0-0' }}</div>
                              <div class="text-[10px] font-bold" [class.text-status-green]="tag(c) === 'A'" [class.text-status-amber]="tag(c) === 'M' || tag(c) === 'P'" [class.text-ink-400]="tag(c) === 'F'">{{ tagLabel(c) }}</div>
                            } @else { <div class="text-xs text-ink-400">—</div><div class="text-[10px] text-ink-400">n/a</div> }
                          </button>
                        }
                      </div>
                    </td>
                  </tr>
                }
              } @empty {
                <tr><td colspan="13" class="px-4 py-10 text-center text-sm text-ink-400">No forecast lines match these filters.</td></tr>
              }
            </tbody>
            @if (rows().length) {
              <tfoot><tr class="border-t-2 border-surface-border font-semibold bg-surface-subtle/50">
                <td></td><td class="px-3 py-2.5" colspan="3">Total</td><td class="px-3 py-2.5 text-right">{{ summary().hc }}</td><td class="px-3 py-2.5 text-right" colspan="3"></td>
                <td class="px-3 py-2.5 text-right">{{ summary().forecast | number:'1.0-0' }}</td><td class="px-3 py-2.5 text-right">{{ summary().actual | number:'1.0-0' }}</td><td class="px-3 py-2.5 text-right">{{ (summary().variance > 0 ? '+' : '') + (summary().variance | number:'1.0-0') }}</td><td colspan="2"></td>
              </tr></tfoot>
            }
          </table>
        </div>
        <p class="text-xs text-ink-400 mt-3">Amounts in OMR. The forecast is kept after an invoice arrives; the actual amount is what counts. Only the current month can be edited, and only until it is locked or closed. Variance = actual − forecast.</p>
      </mat-tab>

      <mat-tab label="Monthly matrix">
        <div class="surface-card overflow-x-auto mt-4">
          <table class="crc-table w-full text-sm">
            <thead><tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide">
              <th class="px-3 py-2.5 font-medium sticky left-0 bg-surface-subtle">Contract / vendor</th><th class="px-3 py-2.5 font-medium">Cost component</th>
              @for (m of months; track m.i) { <th class="px-3 py-2.5 font-medium text-right" [class.text-brand-700]="m.i === curMonth">{{ m.short }}</th> }
              <th class="px-3 py-2.5 font-medium text-right">Year</th>
            </tr></thead>
            <tbody>
              @for (r of rows(); track r.line.id) {
                @for (k of comps; track k.key; let first = $first) {
                  <tr [class.border-t]="first" class="border-surface-border">
                    <td class="px-3 py-1.5 sticky left-0 bg-white">@if (first) { <div class="font-medium text-ink-900">{{ r.line.vendor }}</div><div class="text-[11px] text-ink-400">{{ r.line.contract }} · {{ r.line.category }}</div> }</td>
                    <td class="px-3 py-1.5 text-ink-600">{{ k.key === 'performance' ? svc.settings().performanceLabel : k.label }}</td>
                    @for (m of months; track m.i) {
                      <td class="px-3 py-1.5 text-right" [class.font-semibold]="svc.cell(r.line.id, m.i)?.actual?.[k.key] !== undefined" [class.text-ink-400]="svc.cell(r.line.id, m.i) && svc.cell(r.line.id, m.i)!.actual[k.key] === undefined" [class.italic]="svc.cell(r.line.id, m.i) && svc.cell(r.line.id, m.i)!.actual[k.key] === undefined">{{ svc.cell(r.line.id, m.i) ? (svc.shown(svc.cell(r.line.id, m.i)!, k.key) | number:'1.0-0') : '—' }}</td>
                    }
                    <td class="px-3 py-1.5 text-right font-medium">{{ yearComp(r.line.id, k.key) | number:'1.0-0' }}</td>
                  </tr>
                }
                <tr class="bg-surface-subtle/60"><td class="px-3 py-1.5 sticky left-0 bg-surface-subtle/60"></td><td class="px-3 py-1.5 text-xs font-bold text-ink-500 uppercase">Total</td>
                  @for (m of months; track m.i) { <td class="px-3 py-1.5 text-right font-semibold">{{ svc.cell(r.line.id, m.i) ? (svc.shownTotal(svc.cell(r.line.id, m.i)!) | number:'1.0-0') : '—' }}</td> }
                  <td class="px-3 py-1.5 text-right font-bold text-brand-700">{{ yearTotal(r.line.id) | number:'1.0-0' }}</td></tr>
              }
            </tbody>
            @if (rows().length) {
              <tfoot><tr class="border-t-2 border-surface-border font-bold"><td class="px-3 py-2.5 sticky left-0 bg-white">Monthly totals</td><td></td>
                @for (m of months; track m.i) { <td class="px-3 py-2.5 text-right">{{ monthTotal(m.i) | number:'1.0-0' }}</td> }
                <td class="px-3 py-2.5 text-right text-brand-700">{{ grand() | number:'1.0-0' }}</td></tr></tfoot>
            }
          </table>
        </div>
        <p class="text-xs text-ink-400 mt-3"><b class="text-ink-700">Bold</b> = actual invoice amount · <span class="italic text-ink-400">grey italic</span> = forecast · — = outside the contract period. Amounts in OMR.</p>
      </mat-tab>
    </mat-tab-group>
  `,
  styles: [`.act { width: 30px; height: 30px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; color: #6b7280; } .act:hover { background: #f3f4f6; color: #111827; } .act mat-icon { font-size: 18px; width: 18px; height: 18px; line-height: 18px; }`],
})
export class AccrualForecastComponent {
  store = inject(CrcStore);
  svc = inject(AccrualForecast);
  private ui = inject(UiService);
  private dialog = inject(MatDialog);
  private router = inject(Router);

  field = FIELD;
  year = FY_YEAR;
  curMonth = CUR_MONTH;
  comps = COMPS.map((key) => ({ key, label: COMP_LABEL[key] }));
  months = MONTH_SHORT.map((short, i) => ({ i, short, long: MONTH_LONG[i] }));
  open = signal<Set<string>>(new Set());

  month = signal(CUR_MONTH);
  vendor = signal('All');
  contract = signal('All');
  contractStatus = signal('All');
  status = signal('All');
  category = signal('All');
  invoice = signal('All');
  monthName = computed(() => MONTH_LONG[this.month()]);

  private scoped = computed(() => this.svc.lines.filter((l) => this.svc.settings().contractTypes.includes(l.contractType)));
  private opts = (vals: string[], all: string) => [{ value: 'All', label: all }, ...[...new Set(vals)].map((v) => ({ value: v, label: v }))];
  selects = computed(() => [
    { key: 'fy', label: 'Financial year', value: signal(FY_LABEL), set: () => {}, options: [{ value: FY_LABEL, label: FY_LABEL }] },
    { key: 'month', label: 'Month', value: this.month, set: (v: string) => this.month.set(Number(v)), options: this.months.map((m) => ({ value: String(m.i), label: m.long })) },
    { key: 'vendor', label: 'Vendor', value: this.vendor, set: (v: string) => this.vendor.set(v), options: this.opts(this.scoped().map((l) => l.vendor), 'All vendors') },
    { key: 'contract', label: 'Contract', value: this.contract, set: (v: string) => this.contract.set(v), options: this.opts(this.scoped().map((l) => l.contract), 'All contracts') },
    { key: 'cs', label: 'Contract status', value: this.contractStatus, set: (v: string) => this.contractStatus.set(v), options: this.opts(this.scoped().map((l) => l.contractStatus), 'All statuses') },
    { key: 'st', label: 'Forecast status', value: this.status, set: (v: string) => this.status.set(v), options: this.opts([...ACCRUAL_STATUSES, 'Not applicable'], 'All statuses') },
    { key: 'cat', label: 'Resource category', value: this.category, set: (v: string) => this.category.set(v), options: this.opts(this.scoped().map((l) => l.category), 'All categories') },
    { key: 'inv', label: 'Invoice status', value: this.invoice, set: (v: string) => this.invoice.set(v), options: this.opts(['No invoice', 'Approved', 'Issued'], 'All invoice statuses') },
  ]);

  private lines = computed(() => this.scoped().filter((l) => (this.vendor() === 'All' || l.vendor === this.vendor()) && (this.contract() === 'All' || l.contract === this.contract()) && (this.contractStatus() === 'All' || l.contractStatus === this.contractStatus()) && (this.category() === 'All' || l.category === this.category())));

  rows = computed<Row[]>(() => this.lines()
    .map((line) => {
      const m = this.month(), cell = this.svc.cell(line.id, m), applicable = this.svc.active(line, m);
      return { line, cell, applicable, status: applicable ? this.svc.statusOf(cell) : 'Not applicable', invoice: this.svc.invoiceState(cell), t: cell ? this.svc.totals(cell) : null };
    })
    .filter((r) => (this.status() === 'All' || r.status === this.status()) && (this.invoice() === 'All' || r.invoice === this.invoice())));

  summary = computed(() => {
    const rs = this.rows(), withCell = rs.filter((r) => r.cell && r.t);
    const actual = withCell.reduce((s, r) => s + (r.t!.actual ?? 0), 0), variance = withCell.reduce((s, r) => s + (r.t!.variance ?? 0), 0);
    const actualFor = withCell.reduce((s, r) => s + (r.t!.variance !== null ? r.t!.actual! - r.t!.variance : 0), 0);
    return {
      forecast: withCell.reduce((s, r) => s + r.t!.forecast, 0), actual, variance,
      flagged: actualFor > 0 && Math.abs((variance / actualFor) * 100) > this.svc.settings().varianceThreshold,
      contracts: new Set(rs.filter((r) => r.applicable).map((r) => r.line.contract)).size, lines: withCell.length,
      actualized: withCell.filter((r) => r.t!.actual !== null).length, manual: withCell.filter((r) => r.cell!.manual).length, hc: withCell.reduce((s, r) => s + r.cell!.hc, 0),
    };
  });

  level = (s: string) => ACCRUAL_LEVEL[s];
  tag = (c: AccrualCell) => (COMPS.every((k) => c.actual[k] !== undefined) ? 'A' : COMPS.some((k) => c.actual[k] !== undefined) ? 'P' : c.manual ? 'M' : 'F');
  tagLabel = (c: AccrualCell) => ({ A: 'Actual', P: 'Partial', M: 'Manual', F: 'Forecast' })[this.tag(c)] + (c.closed ? ' · closed' : '');
  toggle(id: string) { this.open.update((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  clear() { this.month.set(CUR_MONTH); for (const s of [this.vendor, this.contract, this.contractStatus, this.status, this.category, this.invoice]) s.set('All'); }

  yearComp = (id: string, k: (typeof COMPS)[number]) => this.months.reduce((s, m) => { const c = this.svc.cell(id, m.i); return s + (c ? this.svc.shown(c, k) : 0); }, 0);
  yearTotal = (id: string) => this.months.reduce((s, m) => { const c = this.svc.cell(id, m.i); return s + (c ? this.svc.shownTotal(c) : 0); }, 0);
  monthTotal = (i: number) => this.rows().reduce((s, r) => { const c = this.svc.cell(r.line.id, i); return s + (c ? this.svc.shownTotal(c) : 0); }, 0);
  grand = () => this.rows().reduce((s, r) => s + this.yearTotal(r.line.id), 0);

  detail(lineId: string) { this.dialog.open(AccrualDetailDialogComponent, { data: { lineId, month: this.month() }, panelClass: 'app-dialog-panel', autoFocus: false, ...DIALOG_SIZE.wide }); }
  viewInvoice() { this.router.navigateByUrl('/invoicing/tracking'); }

  generate() {
    if (!this.ui.requires('Edit Accrual Forecast')) return;
    const run = this.svc.generate('Manual');
    this.ui.toast(run.result === 'Success' ? `Forecast generated. ${run.note}` : `Generation failed. ${run.note}`, 6000);
  }

  /** AF-009/010/011: change the current-month forecast; the reason is required and the system value is kept. */
  async edit(r: Row) {
    if (!r.cell || !this.ui.requires('Edit Accrual Forecast')) return;
    const c = r.cell;
    const v = await this.ui.form({
      title: 'Edit current-month forecast', subtitle: `${r.line.vendor} · ${r.line.category} · ${this.monthName()} ${this.year}. The system-generated amount is kept for audit.`, icon: 'edit', submitLabel: 'Save adjustment',
      values: { hc: c.hc, salary: c.forecast.salary, overtime: c.forecast.overtime, performance: c.forecast.performance, other: c.forecast.other, joiners: c.moves.find((x) => x.type === 'Joiner')?.count ?? 0, joinDay: c.moves.find((x) => x.type === 'Joiner')?.day ?? 1, leavers: c.moves.find((x) => x.type === 'Leaver')?.count ?? 0, leaveDay: c.moves.find((x) => x.type === 'Leaver')?.day ?? 1, total: this.svc.totals(c).forecast },
      fields: [
        { key: 'hc', label: 'Expected resource count', type: 'number', min: 0, required: true, hint: 'A new count re-prices the salary unless you type the salary yourself.' },
        { key: 'joiners', label: 'Joiners this month', type: 'number', min: 0, hint: 'Paid from their first day.' },
        { key: 'joinDay', label: 'Joiners start on day', type: 'number', min: 1, max: 31 },
        { key: 'leavers', label: 'Leavers this month', type: 'number', min: 0, hint: 'Paid up to their last day.' },
        { key: 'leaveDay', label: 'Leavers last day', type: 'number', min: 1, max: 31 },
        { key: 'salary', label: 'Salary (OMR)', type: 'number', min: 0, required: true },
        { key: 'overtime', label: 'Overtime (OMR)', type: 'number', min: 0, required: true },
        { key: 'performance', label: `${this.svc.settings().performanceLabel} (OMR)`, type: 'number', min: 0, required: true },
        { key: 'other', label: 'Other charges (OMR)', type: 'number', min: 0, required: true },
        ...(this.svc.settings().allowTotalOverride ? [{ key: 'total', label: 'Total forecast (OMR)', type: 'number' as const, min: 0, hint: 'Typing a new total puts the difference into other charges.' }] : []),
        { key: 'reason', label: 'Adjustment reason', type: 'textarea', required: true, hint: 'Explain the difference between the system value and your value.' },
      ],
    });
    if (!v) return;
    const err = this.svc.edit(r.line.id, this.month(), { hc: num(v['hc']), salary: num(v['salary']), overtime: num(v['overtime']), performance: num(v['performance']), other: num(v['other']), joiners: num(v['joiners']), joinDay: num(v['joinDay']), leavers: num(v['leavers']), leaveDay: num(v['leaveDay']), total: v['total'] === undefined || v['total'] === null || v['total'] === '' ? undefined : num(v['total']) }, v['reason'] ?? '');
    this.ui.toast(err ?? 'Forecast updated. The original system amount is kept in the history.', err ? 5000 : 4000);
  }

  async recalc(r: Row) {
    if (!r.cell || !this.ui.requires('Edit Accrual Forecast')) return;
    const warn = r.cell.manual ? '\n\nThis line was adjusted by hand — the manual values will be overwritten.' : '';
    const ok = await this.ui.confirm({ title: 'Recalculate this forecast?', message: `${r.line.vendor} · ${r.line.category} · ${this.monthName()}\n\nThe latest resource data and last month's overtime and ${this.svc.settings().performanceLabel.toLowerCase()} will be used again.${warn}`, confirmLabel: 'Recalculate', danger: r.cell.manual });
    if (!ok) return;
    this.svc.recalculate(r.line.id, this.month());
    this.ui.toast('Forecast recalculated.');
  }

  async close() {
    if (!this.ui.requires('Close Forecast Period')) return;
    const m = this.month();
    if (m > CUR_MONTH) { this.ui.toast('A future month cannot be closed yet.', 5000); return; }
    if (this.svc.cells().filter((c) => c.month === m).every((c) => c.closed)) { this.ui.toast(`${MONTH_LONG[m]} is already closed.`); return; }
    const open = this.svc.openLines(m);
    const ok = await this.ui.confirm({ title: `Close ${MONTH_LONG[m]} ${this.year}?`, message: `Nobody except an administrator will be able to change this month.${open ? `\n\n${open} line(s) still have forecast amounts with no invoice.` : '\n\nEvery line already has its invoice amount.'}`, confirmLabel: 'Close period', danger: open > 0 });
    if (!ok) return;
    const err = this.svc.closePeriod(m);
    this.ui.toast(err ?? `${MONTH_LONG[m]} closed.`, err ? 5500 : 3000);
  }

  async approve() {
    if (!this.ui.requires('Close Forecast Period')) return;
    const m = this.month();
    const ok = await this.ui.confirm({ title: `Approve ${MONTH_LONG[m]} ${this.year}?`, message: 'The period is locked for editing and can then be closed.', confirmLabel: 'Approve period', icon: 'verified' });
    if (!ok) return;
    const err = this.svc.approvePeriod(m);
    this.ui.toast(err ?? `${MONTH_LONG[m]} approved.`, err ? 5500 : 3000);
  }

  confirmGeneration() {
    if (!this.ui.requires('Edit Accrual Forecast')) return;
    const r = this.svc.confirmPending();
    if (r) this.ui.toast(r.result === 'Success' ? `Forecast generated. ${r.note}` : `Generation failed. ${r.note}`, 6000);
  }

  exportExcel() {
    if (!this.ui.requires('Export Forecast')) return;
    const f = [this.vendor() !== 'All' && 'Vendor: ' + this.vendor(), this.contract() !== 'All' && 'Contract: ' + this.contract(), this.contractStatus() !== 'All' && 'Contract status: ' + this.contractStatus(), this.category() !== 'All' && 'Category: ' + this.category(), this.status() !== 'All' && 'Forecast status: ' + this.status(), this.invoice() !== 'All' && 'Invoice status: ' + this.invoice()].filter(Boolean).join('; ');
    this.svc.exportExcel(this.rows().map((r) => r.line), f);
  }
}
