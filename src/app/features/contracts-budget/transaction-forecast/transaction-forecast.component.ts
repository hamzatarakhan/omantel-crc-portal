import { Component, computed, inject } from '@angular/core';
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
import { CUR_MONTH, FY_YEAR, ForecastService, MONTHS, MONTH_LONG, MONTH_SHORT, TX_TYPES, isActual } from '../../../core/services/forecast.service';

const TH = 'px-3 py-2.5 font-medium';

/** "Actual / Forecast Spending per month": Voice and Live Chat — transactions and amount; a forecast month costs transactions × unit rate. */
@Component({
  selector: 'app-transaction-forecast',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule, MatTabsModule, PageHeaderComponent, KpiCardComponent, RequiresDirective],
  template: `
    <app-page-header
      title="Transaction Forecast"
      subtitle="Actual and forecast spending on transaction-billed services. Closed months are invoiced; from {{ long[cur] }} on, forecast = expected transactions × unit rate."
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Forecast' }, { label: 'Transaction Forecast' }]"
    >
      <button mat-flat-button color="primary" (click)="svc.exportTransactions()" appRequires="Export Forecast"><mat-icon class="!text-base !mr-1">download</mat-icon>Export to Excel</button>
    </app-page-header>

    <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-2">
      <app-kpi-card label="Approved budget" [value]="s().budget | number:'1.0-0'" unit="OMR" icon="account_balance_wallet"></app-kpi-card>
      <app-kpi-card [label]="'Actual — Jan to ' + short[lastActual]" [value]="s().actual | number:'1.0-0'" unit="OMR" icon="receipt_long" level="normal"></app-kpi-card>
      <app-kpi-card [label]="'Forecast — ' + short[cur] + ' to Dec'" [value]="s().forecast | number:'1.0-0'" unit="OMR" icon="query_stats" level="info"></app-kpi-card>
      <app-kpi-card label="Total spending" [value]="s().total | number:'1.0-0'" unit="OMR" icon="functions"></app-kpi-card>
      <app-kpi-card label="Saving amount" [value]="s().saving | number:'1.0-0'" unit="OMR" icon="savings" [level]="s().saving < 0 ? 'red' : 'normal'"></app-kpi-card>
      <app-kpi-card label="Saving %" [value]="(s().pct | number:'1.2-2') + '%'" icon="percent" [level]="s().saving < 0 ? 'red' : 'normal'"></app-kpi-card>
    </div>
    <p class="text-xs text-ink-500 mb-4 px-1">
      @for (t of types; track t.type; let last = $last) { <b class="text-ink-700">{{ t.type }}</b> — {{ t.reportedTo }} · {{ t.state }} · {{ svc.txRates()[t.type] }} OMR per transaction@if (!last) { &nbsp;|&nbsp; } }
      · <a class="text-brand-600 font-medium" routerLink="/contracts-budget/forecast-settings" appRequires="Configure Forecast">Change rates or budget</a>
    </p>

    <mat-tab-group>
      <mat-tab label="By month">
        <div class="surface-card overflow-x-auto mt-4">
          <table class="crc-table w-full text-sm">
            <thead>
              <tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide">
                <th [class]="th" rowspan="2">Month</th>
                @for (t of types; track t.type) { <th class="px-3 pt-2.5 pb-1 font-bold text-center text-ink-700 border-l border-surface-border" colspan="3">{{ t.type }}</th> }
                <th class="px-3 py-2.5 font-medium text-right border-l border-surface-border" rowspan="2">Total amount</th>
              </tr>
              <tr class="bg-surface-subtle text-left text-[11px] text-ink-500 uppercase tracking-wide">
                @for (t of types; track t.type) { <th class="px-3 pb-2 font-medium text-right border-l border-surface-border">Transactions</th><th class="px-3 pb-2 font-medium text-right">Amount</th><th class="px-3 pb-2 font-medium text-right">OMR / tx</th> }
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.m) {
                <tr class="border-t border-surface-border" [class.bg-brand-50]="!r.actual">
                  <td class="px-3 py-2 font-medium whitespace-nowrap">{{ long[r.m] }} {{ year }} <span class="ml-1 text-[10px] font-bold uppercase" [class.text-ink-400]="r.actual" [class.text-brand-700]="!r.actual">{{ r.actual ? 'Actual' : 'Forecast' }}</span></td>
                  @for (c of r.cells; track c.type) {
                    <td class="px-3 py-2 text-right border-l border-surface-border whitespace-nowrap">
                      {{ c.tx | number:'1.0-0' }}
                      @if (!r.actual && store.can('Edit Forecast')) { <button class="act ml-1" title="Change the expected {{ c.type }} transactions" (click)="edit(c.type, r.m)"><mat-icon>edit</mat-icon></button> }
                    </td>
                    <td class="px-3 py-2 text-right font-semibold" [class.text-brand-700]="!r.actual">{{ c.amount | number:'1.0-0' }}</td>
                    <td class="px-3 py-2 text-right text-ink-500">{{ c.rate | number:'1.3-3' }}</td>
                  }
                  <td class="px-3 py-2 text-right font-bold border-l border-surface-border">{{ r.total | number:'1.0-0' }}</td>
                </tr>
              }
            </tbody>
            <tfoot><tr class="border-t-2 border-surface-border font-bold bg-surface-subtle/50">
              <td class="px-3 py-2.5">Year {{ year }}</td>
              @for (t of totals(); track t.type) { <td class="px-3 py-2.5 text-right border-l border-surface-border">{{ t.tx | number:'1.0-0' }}</td><td class="px-3 py-2.5 text-right">{{ t.amount | number:'1.0-0' }}</td><td class="px-3 py-2.5 text-right text-ink-500">{{ t.rate | number:'1.3-3' }}</td> }
              <td class="px-3 py-2.5 text-right border-l border-surface-border">{{ s().total | number:'1.0-0' }}</td>
            </tr></tfoot>
          </table>
        </div>
        <p class="text-xs text-ink-400 mt-3">Amounts in OMR. Actual months show the invoiced amount and the transactions handled; OMR / tx is what each transaction really cost. The monthly amounts are the forecast of the Voice and Non Voice lines on the Accrual Forecast.</p>
      </mat-tab>

      <mat-tab label="Change history ({{ history().length }})">
        <div class="surface-card overflow-x-auto mt-4">
          <table class="crc-table w-full text-sm">
            <thead><tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide"><th [class]="th">When</th><th [class]="th">By</th><th [class]="th">Type</th><th [class]="th">Month</th><th [class]="th + ' text-right'">From</th><th [class]="th + ' text-right'">To</th><th [class]="th">Reason</th></tr></thead>
            <tbody>
              @for (e of history(); track e.id) {
                <tr class="border-t border-surface-border"><td class="px-3 py-2 whitespace-nowrap">{{ e.at | date:'d MMM, HH:mm' }}</td><td class="px-3 py-2">{{ e.by }}</td><td class="px-3 py-2">{{ e.item }}</td><td class="px-3 py-2">{{ long[e.month] }}</td><td class="px-3 py-2 text-right">{{ e.from | number:'1.0-2' }}</td><td class="px-3 py-2 text-right font-semibold">{{ e.to | number:'1.0-2' }}</td><td class="px-3 py-2 text-ink-600">{{ e.reason }}</td></tr>
              } @empty { <tr><td colspan="7" class="px-4 py-10 text-center text-sm text-ink-400">No transaction forecast has been changed yet.</td></tr> }
            </tbody>
          </table>
        </div>
      </mat-tab>
    </mat-tab-group>
  `,
  styles: [`.act { width: 24px; height: 24px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; color: #9ca3af; vertical-align: middle; } .act:hover { background: #f3f4f6; color: #111827; } .act mat-icon { font-size: 15px; width: 15px; height: 15px; line-height: 15px; }`],
})
export class TransactionForecastComponent {
  store = inject(CrcStore);
  svc = inject(ForecastService);
  private ui = inject(UiService);

  th = TH;
  year = FY_YEAR;
  cur = CUR_MONTH;
  lastActual = Math.max(0, CUR_MONTH - 1);
  short = MONTH_SHORT;
  long = MONTH_LONG;
  types = TX_TYPES;
  s = this.svc.txSummary;

  rows = computed(() => MONTHS.map((m) => {
    const cells = TX_TYPES.map((t) => { const tx = this.svc.txCount(t.type, m), amount = this.svc.txAmount(t.type, m); return { type: t.type, tx, amount, rate: tx ? amount / tx : 0 }; });
    return { m, actual: isActual(m), cells, total: cells.reduce((s, c) => s + c.amount, 0) };
  }));
  totals = computed(() => TX_TYPES.map((t) => {
    const tx = MONTHS.reduce((s, m) => s + this.svc.txCount(t.type, m), 0), amount = MONTHS.reduce((s, m) => s + this.svc.txAmount(t.type, m), 0);
    return { type: t.type, tx, amount, rate: tx ? amount / tx : 0 };
  }));
  history = computed(() => this.svc.edits().filter((e) => e.kind === 'Transaction'));

  async edit(type: string, m: number) {
    if (!this.ui.requires('Edit Forecast')) return;
    const tx = this.svc.txCount(type, m), rate = this.svc.txRates()[type];
    const v = await this.ui.form({
      title: `${type} — ${MONTH_LONG[m]} ${FY_YEAR}`, subtitle: `Expected transactions now ${tx.toLocaleString('en-GB')} × ${rate} OMR = ${this.svc.txAmount(type, m).toLocaleString('en-GB')} OMR.`, icon: 'edit', submitLabel: 'Save forecast',
      values: { tx },
      fields: [
        { key: 'tx', label: 'Expected transactions', type: 'number', min: 0, required: true, hint: `The amount is worked out at ${rate} OMR per transaction.` },
        { key: 'reason', label: 'Reason', type: 'textarea', required: true },
      ],
    });
    if (!v) return;
    const err = this.svc.setTransactions(type, m, Number(v['tx']), v['reason'] ?? '');
    this.ui.toast(err ?? 'Transaction forecast saved.', err ? 5000 : 3000);
  }
}
