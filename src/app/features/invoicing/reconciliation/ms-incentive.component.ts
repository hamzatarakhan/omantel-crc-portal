import { Component, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { RequiresDirective } from '../../../shared/directives/requires.directive';
import { parseMsIncentiveFile } from '../../../core/services/ms-incentive-import';

/** The vendor's monthly Manage Service Incentive workbook: no independent calculation exists for it, so its own total by sales category is what is paid. */
@Component({
  selector: 'app-ms-incentive',
  standalone: true,
  imports: [CommonModule, MatIconModule, RequiresDirective],
  template: `
    <div class="surface-card px-4 py-3 mb-4 flex items-center gap-3 flex-wrap">
      <mat-icon class="!text-brand-600">upload_file</mat-icon>
      <div class="flex-1 min-w-[240px]">
        @if (data(); as d) {
          <div class="text-sm font-semibold text-ink-900">Manage Service Incentive: <span class="text-brand-700">{{ d.fileName }}</span></div>
          <div class="text-xs text-ink-500">{{ d.rows.length }} sales categor{{ d.rows.length === 1 ? 'y' : 'ies' }} &middot; {{ d.total | number:'1.2-2' }} OMR total. We have no independent calculation for it — this file's own totals are what is paid.</div>
        } @else {
          <div class="text-sm font-semibold text-ink-900">No Manage Service Incentive file imported yet</div>
          <div class="text-xs text-ink-500">Import the vendor's monthly Manage Service Incentive workbook (.xlsx) to see the sales incentive by category.</div>
        }
      </div>
      <label class="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg border border-brand-600 text-brand-600 hover:bg-brand-50 cursor-pointer transition-colors" appRequires="Validate Invoice">
        <mat-icon class="!text-lg">folder_open</mat-icon>{{ data() ? 'Import another workbook' : 'Import Manage Service Incentive' }}
        <input type="file" accept=".xlsx" class="hidden" (change)="import($event)" />
      </label>
    </div>

    @if (loading()) { <div class="status-chip status-chip--info mb-4">Reading the workbook…</div> }

    @if (data(); as d) {
      <div class="surface-card overflow-hidden mb-4">
        <div class="px-4 py-3.5 border-b border-surface-border flex items-center justify-between">
          <h3 class="text-[13.5px] font-bold text-ink-900">Sales incentive by category</h3>
          <span class="text-xs font-semibold text-brand-700">{{ d.total | number:'1.2-2' }} OMR total</span>
        </div>
        <table class="crc-table w-full">
          <thead><tr class="text-left"><th>Category</th><th class="text-right">Target</th><th class="text-right">Actual</th><th class="text-right">Achievement</th><th>Status</th><th class="text-right">Incentive (OMR)</th></tr></thead>
          <tbody>
            @for (r of d.rows; track r.category) {
              <tr>
                <td class="font-semibold text-ink-900">{{ r.category }}</td>
                <td class="text-right tabular-nums">{{ r.target | number:'1.0-0' }}</td>
                <td class="text-right tabular-nums">{{ r.actual | number:'1.0-0' }}</td>
                <td class="text-right tabular-nums">{{ r.achievement | percent:'1.0-1' }}</td>
                <td [class.text-status-green]="r.status.toLowerCase().includes('meets') || r.status.includes('✓')" [class.text-status-red]="r.status.toLowerCase().includes('below') || r.status.toLowerCase().includes('fail')">{{ r.status }}</td>
                <td class="text-right tabular-nums font-semibold text-ink-900">{{ r.incentive | number:'1.2-2' }}</td>
              </tr>
            }
          </tbody>
          <tfoot><tr class="font-bold"><td colspan="5" class="!text-ink-900">Total</td><td class="text-right !text-brand-700">{{ d.total | number:'1.2-2' }}</td></tr></tfoot>
        </table>
      </div>
    }
  `,
})
export class MsIncentiveComponent {
  store = inject(CrcStore);
  private ui = inject(UiService);
  vendor = input.required<string>();
  loading = signal(false);

  data = computed(() => this.store.msIncentiveInvoices()[this.vendor()]);

  async import(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.ui.requires('Validate Invoice')) return;
    this.loading.set(true);
    try {
      const data = await parseMsIncentiveFile(file);
      this.store.importMsIncentiveInvoice(this.vendor(), data);
      this.ui.toast(`Loaded ${data.rows.length} categories, ${data.total.toLocaleString('en-GB')} OMR, from ${file.name} — ready to approve.`, 6000);
    } catch (e) {
      this.ui.toast(e instanceof Error ? e.message : 'The workbook could not be read.', 6000);
    } finally {
      this.loading.set(false);
    }
  }
}
