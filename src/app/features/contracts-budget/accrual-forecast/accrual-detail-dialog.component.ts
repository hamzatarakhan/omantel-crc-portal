import { Component, Inject, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { StatusLevel } from '../../../core/models/status';
import { ACCRUAL_LEVEL, AccrualForecast, AccrualLine, COMPS, COMP_LABEL, FY_YEAR, MONTH_LONG } from '../../../core/services/forecast.service';

/** AF 1.9 — everything behind one forecast line: contract, resources, each amount with its source, the invoice and the adjustment history. */
@Component({
  selector: 'app-accrual-detail-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule, StatusChipComponent],
  template: `
    <div class="w-full">
      <div class="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-surface-border">
        <div class="min-w-0">
          <h2 class="text-base font-bold text-ink-900">{{ line.vendor }} · {{ line.category }}</h2>
          <p class="text-xs text-ink-400 mt-0.5">{{ line.contractName }} ({{ line.contract }}) · {{ month }} {{ year }}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <app-status-chip [label]="status" [level]="level"></app-status-chip>
          <button class="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:bg-surface-subtle hover:text-ink-700" (click)="ref.close()"><mat-icon>close</mat-icon></button>
        </div>
      </div>

      <div class="px-6 py-5 max-h-[72vh] overflow-y-auto">
        <dl class="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
          <div><dt class="text-xs text-ink-400">Contract start</dt><dd class="font-medium text-ink-900">{{ line.startDate }}</dd></div>
          <div><dt class="text-xs text-ink-400">Contract expiry</dt><dd class="font-medium text-ink-900">{{ line.endDate }}</dd></div>
          <div><dt class="text-xs text-ink-400">Expected resource count</dt><dd class="font-medium text-ink-900">{{ cell?.hc ?? '—' }}</dd></div>
          <div><dt class="text-xs text-ink-400">Salary rate per resource</dt><dd class="font-medium text-ink-900">{{ line.salary | number:'1.0-0' }} OMR / month</dd></div>
          <div><dt class="text-xs text-ink-400">Invoice reference</dt><dd class="font-medium text-ink-900">{{ cell?.invoice?.ref ?? '—' }}</dd></div>
          <div><dt class="text-xs text-ink-400">Invoice status</dt><dd class="font-medium text-ink-900">{{ svc.invoiceState(cell) }}{{ cell?.invoice?.issued ? ' · issued ' + cell?.invoice?.issued : '' }}</dd></div>
          <div><dt class="text-xs text-ink-400">Forecast</dt><dd class="font-medium text-ink-900">{{ t?.forecast | number:'1.0-0' }} OMR</dd></div>
          <div><dt class="text-xs text-ink-400">Actual invoice amount</dt><dd class="font-medium text-ink-900">{{ t?.actual === null ? '—' : (t?.actual | number:'1.0-0') + ' OMR' }}</dd></div>
        </dl>

        @if (cell && t) {
          <h3 class="text-[13.5px] font-bold text-ink-900 mt-6 mb-2">Amounts and where they come from</h3>
          <table class="crc-table w-full text-sm">
            <thead><tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide"><th class="px-3 py-2 font-medium">Component</th><th class="px-3 py-2 font-medium text-right">Forecast</th><th class="px-3 py-2 font-medium text-right">Actual</th><th class="px-3 py-2 font-medium text-right">Variance</th><th class="px-3 py-2 font-medium">Source</th></tr></thead>
            <tbody>
              @for (r of comps; track r.key) {
                <tr class="border-t border-surface-border">
                  <td class="px-3 py-2 font-medium text-ink-700">{{ r.label }}</td>
                  <td class="px-3 py-2 text-right">{{ cell.forecast[r.key] | number:'1.0-0' }}</td>
                  <td class="px-3 py-2 text-right">{{ cell.actual[r.key] === undefined ? '—' : (cell.actual[r.key] | number:'1.0-0') }}</td>
                  <td class="px-3 py-2 text-right" [class.text-status-red]="diff(r.key) > 0" [class.text-status-green]="diff(r.key) < 0">{{ cell.actual[r.key] === undefined ? '—' : (diff(r.key) | number:'1.0-0') }}</td>
                  <td class="px-3 py-2 text-ink-500">{{ cell.actual[r.key] === undefined ? cell.sources[r.key] : 'ERP invoice' }}</td>
                </tr>
              }
            </tbody>
            <tfoot><tr class="border-t-2 border-surface-border font-semibold"><td class="px-3 py-2">Total</td><td class="px-3 py-2 text-right">{{ t.forecast | number:'1.0-0' }}</td><td class="px-3 py-2 text-right">{{ t.actual === null ? '—' : (t.actual | number:'1.0-0') }}</td><td class="px-3 py-2 text-right" [class.text-status-red]="t.flagged">{{ t.variance === null ? '—' : (t.variance | number:'1.0-0') + ' (' + (t.pct | number:'1.1-1') + '%)' }}</td><td class="px-3 py-2 text-ink-500 font-normal">{{ t.remaining ? t.remaining.toLocaleString() + ' OMR still forecast' : '' }}</td></tr></tfoot>
          </table>
          @if (t.flagged) { <p class="text-xs text-status-red mt-2">The variance is above the {{ svc.settings().varianceThreshold }}% threshold.</p> }
          @if (cell.actual.salary !== undefined || t.actual !== null) { <p class="text-xs text-ink-400 mt-2">The original forecast stays here for audit. The actual invoice amount is the amount shown everywhere else.</p> }
        } @else {
          <div class="mt-6 rounded-lg bg-surface-subtle px-4 py-3 text-sm text-ink-500">No forecast exists for this month — it is outside the contract period or has not been generated.</div>
        }

        <h3 class="text-[13.5px] font-bold text-ink-900 mt-6 mb-3">Adjustment history</h3>
        @if (history().length) {
          <ol class="relative border-l border-surface-border ml-2 flex flex-col gap-3 list-none p-0 m-0 ml-2">
            @for (a of history(); track a.id) {
              <li class="pl-5 relative">
                <span class="absolute -left-[9px] top-0.5 w-[18px] h-[18px] rounded-full bg-white border border-surface-border flex items-center justify-center"><mat-icon class="!text-[13px] !w-[13px] !h-[13px] !leading-[13px] text-brand-600">{{ a.action === 'Manual update' ? 'edit' : a.action === 'Recalculated' ? 'sync' : 'receipt_long' }}</mat-icon></span>
                <div class="text-sm font-medium text-ink-900">{{ a.action }} · {{ a.field }}: {{ a.from | number:'1.0-0' }} → {{ a.to | number:'1.0-0' }}</div>
                <div class="text-xs text-ink-500 mt-0.5">{{ a.reason }}</div>
                <div class="text-[11px] text-ink-400 mt-0.5">{{ a.by }} · {{ a.at | date:'medium' }}</div>
              </li>
            }
          </ol>
        } @else { <p class="text-sm text-ink-400">No manual changes. The system-generated amounts are unchanged.</p> }
      </div>
    </div>
  `,
})
export class AccrualDetailDialogComponent {
  svc = inject(AccrualForecast);
  line: AccrualLine;
  month: string;
  year = FY_YEAR;
  comps = COMPS.map((key) => ({ key, label: COMP_LABEL[key] }));
  history = computed(() => this.svc.adjustments().filter((a) => a.lineId === this.line.id && a.month === this.data.month));

  constructor(@Inject(MAT_DIALOG_DATA) public data: { lineId: string; month: number }, public ref: MatDialogRef<AccrualDetailDialogComponent>) {
    this.line = this.svc.line(data.lineId);
    this.month = MONTH_LONG[data.month];
  }

  get cell() { return this.svc.cell(this.data.lineId, this.data.month); }
  get t() { const c = this.cell; return c ? this.svc.totals(c) : null; }
  get status(): string { return this.svc.active(this.line, this.data.month) ? this.svc.statusOf(this.cell) : 'Not applicable'; }
  get level(): StatusLevel { return ACCRUAL_LEVEL[this.status]; }
  diff(k: (typeof COMPS)[number]) { const c = this.cell!; return c.actual[k]! - c.forecast[k]; }
}
