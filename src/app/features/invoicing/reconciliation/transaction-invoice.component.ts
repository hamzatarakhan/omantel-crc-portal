import { Component, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { RequiresDirective } from '../../../shared/directives/requires.directive';
import { TxChannel, parseTransactionInvoice } from '../../../core/services/transaction-invoice-import';
import { TransactionInvoiceDetailComponent } from './transaction-invoice-detail.component';

/** The vendor's monthly transaction invoice for one channel (Voice, or Non Voice/Chat): we have no independent calculation for it, so the
 * imported file's own totals are what we pay against — this page just makes its numbers, KPIs and penalties visible. */
@Component({
  selector: 'app-transaction-invoice',
  standalone: true,
  imports: [CommonModule, MatTabsModule, MatIconModule, RequiresDirective, TransactionInvoiceDetailComponent],
  template: `
    <div class="surface-card px-4 py-3 mb-4 flex items-center gap-3 flex-wrap">
      <mat-icon class="!text-brand-600">upload_file</mat-icon>
      <div class="flex-1 min-w-[240px]">
        @if (data(); as d) {
          <div class="text-sm font-semibold text-ink-900">{{ channel() }} invoice: <span class="text-brand-700">{{ d.fileName }}</span></div>
          <div class="text-xs text-ink-500">Invoice {{ d.invoiceNo }} &middot; service period {{ d.servicePeriod }} &middot; rate {{ d.rate | number:'1.2-3' }} OMR per transaction. We have no independent calculation for {{ channel() }} — this file's own totals are what is paid.</div>
        } @else {
          <div class="text-sm font-semibold text-ink-900">No {{ channel() }} invoice imported yet</div>
          <div class="text-xs text-ink-500">Import the vendor's monthly {{ channel() }} transaction invoice workbook (.xlsx). It is read in your browser only — nothing is uploaded or stored.</div>
        }
      </div>
      <label class="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg border border-brand-600 text-brand-600 hover:bg-brand-50 cursor-pointer transition-colors" appRequires="Validate Invoice">
        <mat-icon class="!text-lg">folder_open</mat-icon>{{ data() ? 'Import another ' + channel() + ' workbook' : 'Import ' + channel() + ' invoice' }}
        <input type="file" accept=".xlsx" class="hidden" (change)="import($event)" />
      </label>
    </div>

    @if (loading()) { <div class="status-chip status-chip--info mb-4">Reading the workbook…</div> }

    @if (data(); as d) {
      <app-transaction-invoice-detail [data]="d"></app-transaction-invoice-detail>
    }
  `,
})
export class TransactionInvoiceComponent {
  store = inject(CrcStore);
  private ui = inject(UiService);
  vendor = input.required<string>();
  channel = input.required<TxChannel>();
  loading = signal(false);

  data = computed(() => this.store.transactionInvoiceFor(this.vendor(), this.channel()));

  async import(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.ui.requires('Validate Invoice')) return;
    this.loading.set(true);
    try {
      const data = await parseTransactionInvoice(file, this.channel());
      this.store.importTransactionInvoice(this.vendor(), data);
      this.ui.toast(`Loaded ${data.invoicedTransactions.toLocaleString('en-GB')} invoiced transactions and ${data.dailyRows.length} days from ${file.name} — ready to approve.`, 6000);
    } catch (e) {
      this.ui.toast(e instanceof Error ? e.message : 'The workbook could not be read.', 6000);
    } finally {
      this.loading.set(false);
    }
  }
}
