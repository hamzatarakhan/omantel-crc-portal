import { Component, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { RequiresDirective } from '../../../shared/directives/requires.directive';
import { TxChannel, parseTransactionInvoice } from '../../../core/services/transaction-invoice-import';

/** The vendor's monthly transaction invoice for one channel (Voice, or Non Voice/Chat): we have no independent calculation for it, so the
 * imported file's own totals are what we pay against — this page just makes its numbers, KPIs and penalties visible. */
@Component({
  selector: 'app-transaction-invoice',
  standalone: true,
  imports: [CommonModule, MatTabsModule, MatIconModule, RequiresDirective],
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
        <mat-icon class="!text-lg">folder_open</mat-icon>{{ data() ? 'Import another workbook' : 'Import invoice workbook' }}
        <input type="file" accept=".xlsx" class="hidden" (change)="import($event)" />
      </label>
    </div>

    @if (loading()) { <div class="status-chip status-chip--info mb-4">Reading the workbook…</div> }

    @if (data(); as d) {
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div class="surface-card px-4 py-3"><div class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Offered / Answered</div><div class="text-lg font-bold text-ink-900 mt-1">{{ d.offered | number:'1.0-0' }} / {{ d.answered | number:'1.0-0' }}</div></div>
        <div class="surface-card px-4 py-3"><div class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Invoiced transactions</div><div class="text-lg font-bold text-ink-900 mt-1">{{ d.invoicedTransactions | number:'1.0-3' }}</div></div>
        <div class="surface-card px-4 py-3"><div class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">SLA</div><div class="text-lg font-bold mt-1" [class.text-status-red]="d.slaPct < 0.9" [class.text-ink-900]="d.slaPct >= 0.9">{{ d.slaPct | percent:'1.0-1' }}</div></div>
        <div class="surface-card px-4 py-3"><div class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Abandonment</div><div class="text-lg font-bold text-ink-900 mt-1">{{ d.abandonmentPct | percent:'1.0-2' }}</div></div>
      </div>

      <div class="surface-card px-4 py-4 mb-4">
        <h3 class="text-[13.5px] font-bold text-ink-900 mb-3">Invoice amount</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><div class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Total invoiced transactions</div><div class="text-lg font-bold text-ink-900 mt-1">{{ d.totalInvoicedAmount | number:'1.2-2' }} OMR</div></div>
          <div><div class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Forecast accuracy effect</div><div class="text-lg font-bold mt-1" [class]="d.forecastAccuracyEffectAmount < 0 ? 'text-status-red' : d.forecastAccuracyEffectAmount > 0 ? 'text-status-green' : 'text-ink-900'">{{ d.forecastAccuracyEffectAmount > 0 ? '+' : '' }}{{ d.forecastAccuracyEffectAmount | number:'1.2-2' }} OMR</div></div>
          <div><div class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">KPI penalties</div><div class="text-lg font-bold mt-1" [class]="d.kpiPenaltyAmount < 0 ? 'text-status-red' : d.kpiPenaltyAmount > 0 ? 'text-status-green' : 'text-ink-900'">{{ d.kpiPenaltyAmount > 0 ? '+' : '' }}{{ d.kpiPenaltyAmount | number:'1.2-2' }} OMR</div></div>
          <div><div class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Net invoice amount</div><div class="text-lg font-bold text-brand-700 mt-1">{{ d.netInvoiceAmount | number:'1.2-2' }} OMR</div></div>
        </div>
        <p class="text-[11px] text-ink-400 mt-2">Reconciliation pays the <b>total invoiced transactions</b> amount for this line; the forecast-accuracy effect and KPI penalties/incentives below are the vendor's own adjustments, kept here for visibility and not (yet) deducted from the payable line.</p>
      </div>

      <div class="surface-card overflow-hidden mb-4">
        <div class="px-4 py-3.5 border-b border-surface-border flex items-center justify-between">
          <h3 class="text-[13.5px] font-bold text-ink-900">KPI &amp; penalties</h3>
          <span class="text-xs font-semibold" [class]="d.totalPenalty < 0 ? 'text-status-red' : d.totalPenalty > 0 ? 'text-status-green' : 'text-ink-400'">{{ d.totalPenalty === 0 ? 'No penalty or incentive' : (d.totalPenalty > 0 ? '+' : '') + (d.totalPenalty | number:'1.2-2') + ' OMR' }}</span>
        </div>
        <div class="overflow-x-auto">
          <table class="crc-table w-full">
            <thead><tr class="text-left">
              @if (d.kpiRows[0]?.channel) { <th>Channel</th> }
              <th>KPI</th><th class="text-right">Target</th><th class="text-right">Actual</th>
              @if (d.kpiRows[0]?.variance !== undefined) { <th class="text-right">Variance</th> }
              <th>Status</th><th class="text-right">Penalty (OMR)</th>
            </tr></thead>
            <tbody>
              @for (r of d.kpiRows; track r.kpi + (r.channel ?? '')) {
                <tr>
                  @if (r.channel) { <td>{{ r.channel }}</td> }
                  <td [title]="r.bracket ?? ''">{{ r.kpi }}</td>
                  <td class="text-right tabular-nums">{{ isPct(r.target) ? (r.target | percent:'1.0-2') : (r.target | number:'1.0-2') }}</td>
                  <td class="text-right tabular-nums">{{ isPct(r.target) ? (r.actual | percent:'1.0-2') : (r.actual | number:'1.0-2') }}</td>
                  @if (r.variance !== undefined) { <td class="text-right tabular-nums">{{ isPct(r.target) ? (r.variance | percent:'1.0-2') : (r.variance | number:'1.0-2') }}</td> }
                  <td [class.text-status-green]="!r.penalty && !r.status.toLowerCase().includes('fail')" [class.text-status-red]="r.penalty < 0 || r.status.toLowerCase().includes('fail')">{{ r.status }}</td>
                  <td class="text-right tabular-nums" [class.text-status-red]="r.penalty < 0" [class.text-status-green]="r.penalty > 0">{{ r.penalty | number:'1.2-2' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="surface-card overflow-hidden">
        <div class="px-4 py-3.5 border-b border-surface-border">
          <h3 class="text-[13.5px] font-bold text-ink-900">Daily performance</h3>
          <p class="text-xs text-ink-400 mt-0.5">{{ d.dailyRows.length }} days, exactly as columned in the vendor's own workbook.</p>
        </div>
        <div class="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table class="crc-table w-full text-xs">
            <thead class="sticky top-0 bg-white"><tr class="text-left"><th>Date</th>@for (h of d.dailyHeaders; track h) { <th class="text-right">{{ h }}</th> }</tr></thead>
            <tbody>
              @for (r of d.dailyRows; track r.date) {
                <tr><td class="whitespace-nowrap">{{ r.date | date:'d MMM' }}</td>@for (h of d.dailyHeaders; track h) { <td class="text-right tabular-nums">{{ r.values[h] | number:'1.0-2' }}</td> }</tr>
              }
            </tbody>
          </table>
        </div>
      </div>
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
  isPct = (n: number) => Math.abs(n) <= 1.5;

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
