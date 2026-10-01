import { Component, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { CrcStore } from '../../../core/services/crc-store.service';
import type { XCell } from '../../../shared/services/ui.service';
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
      <div class="flex items-center gap-2 flex-wrap">
      @if (store.can('Validate Invoice')) {
        <button type="button" [class]="'inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg transition-colors ' + (templateReady() ? 'border border-surface-border text-ink-700 hover:bg-surface-subtle' : 'bg-brand-600 text-white hover:bg-brand-700')" (click)="downloadTemplate()">
          @if (templateReady()) { <mat-icon class="!text-lg">check_circle</mat-icon> } @else { <span class="w-5 h-5 rounded-full bg-white text-brand-700 text-xs font-bold flex items-center justify-center">1</span> }{{ templateReady() ? 'Template downloaded' : 'Download template' }}
        </button>
        <mat-icon class="!text-lg text-ink-300">arrow_forward</mat-icon>
      }
      <label [class]="'inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg border transition-colors ' + (importLocked() ? 'border-surface-border text-ink-400 bg-surface-subtle cursor-not-allowed' : 'border-brand-600 text-brand-600 hover:bg-brand-50 cursor-pointer')" appRequires="Validate Invoice" [attr.title]="importLocked() ? 'Download the template first, fill it in, then import it' : ''">
        <span class="w-5 h-5 rounded-full border text-xs font-bold flex items-center justify-center" [class]="importLocked() ? 'border-ink-300' : 'border-brand-600'">2</span>{{ data() ? 'Import another ' + channel() + ' workbook' : 'Import ' + channel() + ' invoice' }}
        <input type="file" accept=".xlsx" class="hidden" [disabled]="importLocked()" (change)="import($event)" />
      </label>
      </div>
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

  /** The claiming sheet for this service type, laid out the way the importer reads it: labelled summary cells, then the KPI and daily sheets. */

  /** The vendor downloads the template before the import unlocks; a file that is already imported keeps it unlocked. */
  templateReady = computed(() => this.store.templatesDownloaded().has(this.vendor() + '|' + this.channel()) || !!this.data());
  importLocked = computed(() => this.store.can('Validate Invoice') && !this.templateReady());

  downloadTemplate() {
    this.store.markTemplate(this.vendor() + '|' + this.channel());
    const t = (v: string): XCell => ({ v, s: 'head' });
    const e = (): XCell => ({ v: null, s: 'text' });
    const summary: XCell[][] = [
      [t('Invoice No.'), e()], [t('Issue Date'), e()], [t('Service Period'), e()], [t('Call Rate'), e()], [],
      ['Total Calls Offered', 'Total Calls Answered', 'Invoiced Transactions', 'SLA %', 'Abandonment %', 'Forecast Accuracy', 'CEI', 'KPI Penalties %', 'Accuracy Effect Amount', 'Total Invoiced Transactions Amount', 'KPI Penalties Amount', 'Net Invoice Amount'].map(t),
      Array.from({ length: 12 }, e),
    ];
    const kpi: XCell[][] = [['#', 'Channel', 'KPI', 'Target', 'Actual', 'Variance', 'Status', 'Penalty'].map(t), Array.from({ length: 8 }, e)];
    const daily: XCell[][] = [['Date', 'Offered', 'Answered', 'Abandoned'].map(t), Array.from({ length: 4 }, e)];
    const name = this.ui.xlsxStyled(`${this.channel().toLowerCase()}-claiming-sheet-template`, [
      { name: 'Invoice Summary', rows: summary, widths: [34, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26] },
      { name: 'KPI & Penalty', rows: kpi, widths: [6, 14, 30, 12, 12, 12, 14, 12] },
      { name: 'Daily Performance', rows: daily, widths: [16, 14, 14, 14] },
    ]);
    this.ui.toast(`Downloaded ${name}.`);
  }
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
      this.store.rememberFile(this.vendor() + '|' + this.channel(), file);
      this.ui.toast(`Loaded ${data.invoicedTransactions.toLocaleString('en-GB')} invoiced transactions and ${data.dailyRows.length} days from ${file.name} — ready to approve.`, 6000);
    } catch (e) {
      this.ui.toast(e instanceof Error ? e.message : 'The workbook could not be read.', 6000);
    } finally {
      this.loading.set(false);
    }
  }
}
