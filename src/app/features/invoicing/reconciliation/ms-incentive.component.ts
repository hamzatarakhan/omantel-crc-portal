import { Component, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { RequiresDirective } from '../../../shared/directives/requires.directive';
import { parseMsIncentiveFile } from '../../../core/services/ms-incentive-import';
import { MsIncentiveDetailComponent } from './ms-incentive-detail.component';

/** The vendor's monthly Manage Service Incentive workbook: no independent calculation exists for it, so its own total by sales category is what is paid. */
@Component({
  selector: 'app-ms-incentive',
  standalone: true,
  imports: [CommonModule, MatIconModule, RequiresDirective, MsIncentiveDetailComponent],
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
      <app-ms-incentive-detail [data]="d"></app-ms-incentive-detail>
    }
  `,
})
export class MsIncentiveComponent {
  store = inject(CrcStore);
  private ui = inject(UiService);
  vendor = input.required<string>();
  loading = signal(false);

  data = computed(() => this.store.msIncentiveInvoices()[this.vendor()]?.[0]);

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
