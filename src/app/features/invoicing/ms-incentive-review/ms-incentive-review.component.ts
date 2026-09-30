import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { MsIncentiveImport } from '../../../core/services/ms-incentive-import';
import { MsIncentiveDetailComponent } from '../reconciliation/ms-incentive-detail.component';

interface Row { vendorName: string; data: MsIncentiveImport }

const FIELD = 'w-full px-2.5 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 focus:outline-none focus:border-brand-400';
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Every Manage Service Incentive file imported this session, across every vendor and month — filterable, with the same deep-dive view used on Reconciliation. */
@Component({
  selector: 'app-ms-incentive-review',
  standalone: true,
  imports: [CommonModule, MatIconModule, PageHeaderComponent, MsIncentiveDetailComponent],
  template: `
    <app-page-header
      title="Manage Service Incentive Files"
      subtitle="Review every vendor Manage Service Incentive workbook imported this session, across every month, with the sales-category breakdown"
      [breadcrumbs]="[{ label: 'Invoicing & Payments', link: '/invoicing/reconciliation' }, { label: 'Manage Service Incentive Files' }]"
    ></app-page-header>

    <div class="surface-card px-4 py-3.5 mb-4">
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
        <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Vendor</span>
          <select [class]="field + ' mt-1'" (change)="vendor.set($any($event.target).value)">
            <option value="" [selected]="!vendor()">All vendors</option>
            @for (v of vendors(); track v) { <option [value]="v" [selected]="v === vendor()">{{ v }}</option> }
          </select>
        </label>
        <label class="block sm:col-span-2"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Month</span>
          <select [class]="field + ' mt-1'" (change)="month.set($any($event.target).value ? +$any($event.target).value : null)">
            <option value="" [selected]="month() === null">All months</option>
            @for (m of months(); track m) { <option [value]="m" [selected]="m === month()">{{ monthName(m) }}</option> }
          </select>
        </label>
      </div>
      @if (vendor() || month() !== null) {
        <button type="button" class="text-xs font-semibold text-brand-600 hover:underline mt-2.5" (click)="clear()">Clear filters</button>
      }
    </div>

    <div class="surface-card overflow-x-auto mb-5">
      <table class="crc-table w-full text-sm">
        <thead><tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide">
          <th class="px-3 py-2.5 font-medium">Vendor</th><th class="px-3 py-2.5 font-medium">Month</th><th class="px-3 py-2.5 font-medium">File</th>
          <th class="px-3 py-2.5 font-medium">Categories</th><th class="px-3 py-2.5 font-medium text-right">Total (OMR)</th><th></th>
        </tr></thead>
        <tbody>
          @for (r of filtered(); track r.vendorName + r.data.month) {
            <tr class="border-t border-surface-border cursor-pointer hover:bg-surface-subtle" [class.bg-brand-50]="isSelected(r)" (click)="select(r)">
              <td class="px-3 py-2 font-semibold text-ink-900">{{ r.vendorName }}</td>
              <td class="px-3 py-2">{{ monthName(r.data.month) }}</td>
              <td class="px-3 py-2 text-ink-500">{{ r.data.fileName }}</td>
              <td class="px-3 py-2">{{ r.data.rows.length }}</td>
              <td class="px-3 py-2 text-right tabular-nums font-semibold">{{ r.data.total | number:'1.2-2' }}</td>
              <td class="px-3 py-2 text-right"><mat-icon class="!text-lg !text-ink-300">chevron_right</mat-icon></td>
            </tr>
          } @empty { <tr><td colspan="6" class="px-4 py-10 text-center text-sm text-ink-400">No Manage Service Incentive file matches these filters yet — import one from a Payable Line on Reconciliation.</td></tr> }
        </tbody>
      </table>
    </div>

    @if (selected(); as s) {
      <app-ms-incentive-detail [data]="s.data"></app-ms-incentive-detail>
    }
  `,
})
export class MsIncentiveReviewComponent {
  store = inject(CrcStore);
  field = FIELD;

  vendor = signal('');
  month = signal<number | null>(null);

  all = computed<Row[]>(() => this.store.msIncentiveInvoiceHistory().sort((a, b) => b.data.month - a.data.month));
  vendors = computed(() => [...new Set(this.all().map((r) => r.vendorName))]);
  months = computed(() => [...new Set(this.all().map((r) => r.data.month))].sort((a, b) => a - b));

  filtered = computed(() => this.all().filter((r) => (!this.vendor() || r.vendorName === this.vendor()) && (this.month() === null || r.data.month === this.month())));

  monthName(m: number) {
    return MONTH_NAMES[m - 1] ?? m;
  }

  clear() { this.vendor.set(''); this.month.set(null); }

  selected = signal<Row | null>(null);
  isSelected(r: Row) { return this.selected()?.vendorName === r.vendorName && this.selected()?.data === r.data; }
  select(r: Row) { this.selected.set(this.isSelected(r) ? null : r); }
}
