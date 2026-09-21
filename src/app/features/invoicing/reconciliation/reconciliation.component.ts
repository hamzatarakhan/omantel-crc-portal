import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { StatusLevel } from '../../../core/models/status';
import { InvoicePreviewComponent } from './invoice-preview.component';
import { AnnexureComponent } from './annexure.component';

const VENDORS = ['Infoline LLC', 'Green Umbrella Services'];

import { RequiresDirective } from '../../../shared/directives/requires.directive';

@Component({
  selector: 'app-reconciliation',
  standalone: true,
  imports: [RequiresDirective, InvoicePreviewComponent, AnnexureComponent, CommonModule, FormsModule, RouterModule, MatButtonModule, MatIconModule, PageHeaderComponent, StatusChipComponent],
  template: `
    <app-page-header
      title="Reconciliation Workspace"
      subtitle="Payable calculation from synced WFO attendance/overtime + 3 Clicks incentives, for validating the vendor invoice"
      [breadcrumbs]="[{ label: 'Invoicing & Payments', link: '/invoicing/reconciliation' }, { label: 'Reconciliation Workspace' }]"
    >
      <span class="status-chip status-chip--neutral">{{ store.period() }}</span>
      <app-status-chip [label]="status()" [level]="statusLevel()"></app-status-chip>
    </app-page-header>

    <div class="flex items-stretch gap-3 flex-wrap mb-4">
      <div class="flex items-center gap-1 bg-white border border-surface-border rounded-lg p-0.5">
        @for (v of vendors; track v) {
          <button (click)="vendor.set(v)" class="h-8 inline-flex items-center px-3 text-xs font-semibold rounded-md transition-colors" [class]="vendor() === v ? 'bg-brand-50 text-brand-700' : 'text-ink-500 hover:text-ink-900'">{{ v }}</button>
        }
      </div>
      <div class="flex items-center gap-1 bg-white border border-surface-border rounded-lg p-0.5">
        <button (click)="view.set('calc')" class="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-semibold rounded-md transition-colors" [class]="view() === 'calc' ? 'bg-brand-50 text-brand-700' : 'text-ink-500 hover:text-ink-900'"><mat-icon class="!text-base">calculate</mat-icon>Calculation</button>
        <button (click)="view.set('invoice')" class="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-semibold rounded-md transition-colors" [class]="view() === 'invoice' ? 'bg-brand-50 text-brand-700' : 'text-ink-500 hover:text-ink-900'"><mat-icon class="!text-base">receipt_long</mat-icon>Invoice preview</button>
        <button (click)="view.set('annexure')" class="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-semibold rounded-md transition-colors" [class]="view() === 'annexure' ? 'bg-brand-50 text-brand-700' : 'text-ink-500 hover:text-ink-900'"><mat-icon class="!text-base">table_view</mat-icon>Annexure</button>
      </div>
    </div>

    @if (view() === 'invoice') {
      <app-invoice-preview [vendor]="vendor()"></app-invoice-preview>
    } @else if (view() === 'annexure') {
      <app-annexure [vendor]="vendor()"></app-annexure>
    } @else {
    <div class="surface-card overflow-x-auto mb-4">
      <div class="px-4 pt-3.5"><h3 class="text-[13.5px] font-bold text-ink-900">Payable calculation</h3><p class="text-xs text-ink-400 mt-0.5">Billing rate × billable days ÷ working days, per agent, from the <a class="text-brand-600 font-medium" routerLink="/csr/leave">attendance sheet</a>. Absence (A) is deducted; approved leave stays billable.</p></div>
      <table class="crc-table w-full mt-3">
        <thead>
          <tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide">
            <th class="px-4 py-2.5 font-medium">Tier</th>
            <th class="px-4 py-2.5 font-medium text-right">Headcount</th>
            <th class="px-4 py-2.5 font-medium text-right">Billable FTE</th>
            <th class="px-4 py-2.5 font-medium text-right">Billing rate</th>
            <th class="px-4 py-2.5 font-medium text-right">Amount (OMR)</th>
          </tr>
        </thead>
        <tbody>
          @for (t of calc().tiers; track t.degree) {
            <tr class="border-t border-surface-border">
              <td class="px-4 py-2 font-medium text-ink-700">{{ t.degree }} tier</td>
              <td class="px-4 py-2 text-right">{{ t.headcount }}</td>
              <td class="px-4 py-2 text-right">{{ t.billableFte | number:'1.2-2' }}</td>
              <td class="px-4 py-2 text-right">{{ t.rate | number:'1.2-2' }}</td>
              <td class="px-4 py-2 text-right font-medium">{{ t.amount | number:'1.2-2' }}</td>
            </tr>
          }
          <tr class="border-t border-surface-border">
            <td class="px-4 py-2 font-medium text-ink-700">New joining <span class="text-xs text-ink-400 font-normal">&middot; joined this month, billed pro-rata</span></td>
            <td class="px-4 py-2 text-right">{{ calc().newJoining.units }}</td><td class="px-4 py-2"></td><td class="px-4 py-2"></td>
            <td class="px-4 py-2 text-right font-medium text-status-normal">+{{ calc().newJoining.amount | number:'1.2-2' }}</td>
          </tr>
          <tr class="border-t border-surface-border">
            <td class="px-4 py-2 font-medium text-ink-700">Resignations <span class="text-xs text-ink-400 font-normal">&middot; pro-rata to the last day + leave encashment</span></td>
            <td class="px-4 py-2 text-right">{{ calc().resignation.units }}</td><td class="px-4 py-2"></td><td class="px-4 py-2"></td>
            <td class="px-4 py-2 text-right font-medium text-status-normal">+{{ calc().resignation.amount | number:'1.2-2' }}</td>
          </tr>
          <tr class="border-t border-surface-border">
            <td class="px-4 py-2 font-medium text-ink-700" colspan="4">3 Clicks incentive <span class="text-xs text-ink-400 font-normal">&middot; {{ calc().eligibleCalls | number }} of {{ calc().sampleCalls | number }} calls eligible ({{ calc().excludedCalls | number }} shorter than {{ calc().threshold }}s excluded — <a class="text-brand-600" routerLink="/invoicing/rules">change rule</a>)</span></td>
            <td class="px-4 py-2 text-right font-medium" [class]="calc().incentiveIncluded ? 'text-status-normal' : 'text-ink-400'">{{ calc().incentiveIncluded ? '+' : '' }}{{ calc().incentive | number:'1.2-2' }}{{ calc().incentiveIncluded ? '' : ' · not billed' }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="border-t-2 border-surface-border"><td class="px-4 py-2" colspan="4">Subtotal</td><td class="px-4 py-2 text-right">{{ calc().subtotal | number:'1.2-2' }}</td></tr>
          <tr><td class="px-4 py-1.5 text-ink-500" colspan="4">VAT 5%</td><td class="px-4 py-1.5 text-right text-ink-500">{{ calc().vat | number:'1.2-2' }}</td></tr>
          <tr class="font-semibold"><td class="px-4 py-2.5" colspan="4">Calculated total (incl. VAT)</td><td class="px-4 py-2.5 text-right text-brand-700">{{ calc().total | number:'1.2-2' }}</td></tr>
        </tfoot>
      </table>
    </div>

    <div class="surface-card p-4 mb-4">
      <h3 class="text-[13.5px] font-bold text-ink-900">Vendor invoice</h3>
      <p class="text-xs text-ink-400 mt-0.5 mb-3">Enter the total on the vendor's tax invoice (incl. VAT). It is compared with the calculation above; a deviation above {{ store.payableRules().deviationPct }}% is flagged for review.</p>
      <div class="flex items-end gap-3 flex-wrap">
        <div>
          <label class="text-xs text-ink-500 block mb-1">Invoice total (OMR)</label>
          <input type="number" step="0.01" class="w-48 border border-surface-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-400 disabled:bg-surface-subtle" [ngModel]="amount()" (ngModelChange)="setAmount(+$event)" [disabled]="locked()" />
        </div>
        <button mat-stroked-button (click)="useCalculated()" [disabled]="locked()">Use calculated amount</button>
        <div class="text-sm pb-2">
          Variance: <span class="font-semibold" [class]="withinTolerance() ? 'text-status-normal' : 'text-status-red'">{{ variance() >= 0 ? '+' : '' }}{{ variance() | number:'1.2-2' }}%</span>
          <span class="text-xs text-ink-400"> ({{ diff() >= 0 ? '+' : '' }}{{ diff() | number:'1.2-2' }} OMR)</span>
        </div>
      </div>

      <div class="flex items-center gap-2 mt-4 flex-wrap">
        <button mat-flat-button color="primary" (click)="validate()" appRequires="Validate Invoice" [disabled]="locked() || !amount()"><mat-icon class="!text-base !mr-1">fact_check</mat-icon>Validate invoice</button>
        @if (run()?.status === 'Validated' || run()?.status === 'Flagged for review') {
          <button mat-flat-button color="primary" (click)="approve()" appRequires="Validate Invoice"><mat-icon class="!text-base !mr-1">payments</mat-icon>Approve for payment</button>
        }
        @if (run()?.status === 'Approved for payment') {
          <a mat-stroked-button routerLink="/invoicing/tracking"><mat-icon class="!text-base !mr-1">view_kanban</mat-icon>Open in PO & Payment Tracking</a>
        }
      </div>
      @if (run(); as r) {
        <p class="text-xs mt-3" [class]="r.status === 'Flagged for review' ? 'text-status-red font-medium' : 'text-status-normal font-medium'">
          {{ r.status }} — vendor invoice {{ r.vendorInvoiceAmount | number:'1.2-2' }} vs calculated {{ r.calculatedTotal | number:'1.2-2' }} OMR ({{ r.variancePct! >= 0 ? '+' : '' }}{{ r.variancePct | number:'1.2-2' }}%).
        </p>
      }
    </div>

    <div class="surface-card overflow-x-auto">
      <div class="px-4 pt-3.5"><h3 class="text-[13.5px] font-bold text-ink-900">Billing-rate build-up</h3><p class="text-xs text-ink-400 mt-0.5">Basic + HRA + conveyance + allowances + management fee, as on the vendor's monthly annexure</p></div>
      <table class="crc-table w-full mt-3">
        <thead>
          <tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide">
            <th class="px-4 py-2.5 font-medium">Tier</th><th class="px-4 py-2.5 font-medium text-right">Basic</th><th class="px-4 py-2.5 font-medium text-right">HRA</th>
            <th class="px-4 py-2.5 font-medium text-right">Conveyance</th><th class="px-4 py-2.5 font-medium text-right">Special Allow.</th><th class="px-4 py-2.5 font-medium text-right">Gross</th>
            <th class="px-4 py-2.5 font-medium text-right">Mgmt Fee</th><th class="px-4 py-2.5 font-medium text-right">Additions</th><th class="px-4 py-2.5 font-medium text-right">Deductions</th><th class="px-4 py-2.5 font-medium text-right">Billing Rate</th>
          </tr>
        </thead>
        <tbody>
          @for (line of store.payableRates; track line.employeeName) {
            <tr class="border-t border-surface-border">
              <td class="px-4 py-2 font-medium text-ink-700">{{ line.employeeName }}</td>
              <td class="px-4 py-2 text-right">{{ line.basic | number:'1.2-2' }}</td><td class="px-4 py-2 text-right">{{ line.hra | number:'1.2-2' }}</td>
              <td class="px-4 py-2 text-right">{{ line.conveyance | number:'1.2-2' }}</td><td class="px-4 py-2 text-right">{{ line.specialAllowance | number:'1.2-2' }}</td>
              <td class="px-4 py-2 text-right font-medium">{{ line.gross | number:'1.2-2' }}</td><td class="px-4 py-2 text-right">{{ line.managementFee | number:'1.2-2' }}</td>
              <td class="px-4 py-2 text-right text-status-normal">+{{ line.additions | number:'1.2-2' }}</td><td class="px-4 py-2 text-right text-status-red">-{{ line.deductions | number:'1.2-2' }}</td>
              <td class="px-4 py-2 text-right font-semibold text-brand-700">{{ line.billingRate | number:'1.2-2' }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    }
  `,
})
export class ReconciliationComponent {
  store = inject(CrcStore);
  private ui = inject(UiService);

  vendors = VENDORS;
  vendor = signal(VENDORS[0]);
  view = signal<'calc' | 'invoice' | 'annexure'>('calc');
  private typed = signal<Record<string, number>>({});

  calc = computed(() => this.store.calculateInvoice(this.vendor()));
  run = computed(() => this.store.invoiceRuns()[this.vendor()]);
  status = computed(() => this.run()?.status ?? 'Not started');
  statusLevel = computed<StatusLevel>(() => ({ 'Not started': 'neutral', Validated: 'normal', 'Flagged for review': 'red', 'Approved for payment': 'info' } as Record<string, StatusLevel>)[this.status()]);
  locked = computed(() => this.run()?.status === 'Approved for payment');
  amount = computed(() => this.typed()[this.vendor()] ?? this.run()?.vendorInvoiceAmount ?? Math.round(this.calc().total * 100) / 100);
  diff = computed(() => this.amount() - this.calc().total);
  variance = computed(() => (this.calc().total ? (this.diff() / this.calc().total) * 100 : 0));
  withinTolerance = computed(() => Math.abs(this.variance()) <= this.store.payableRules().deviationPct);

  setAmount(v: number) {
    this.typed.update((m) => ({ ...m, [this.vendor()]: v }));
  }

  useCalculated() {
    this.setAmount(Math.round(this.calc().total * 100) / 100);
  }

  validate() {
    if (!this.ui.requires('Validate Invoice')) return;
    const run = this.store.validateInvoice(this.vendor(), this.amount());
    this.ui.toast(run.status === 'Validated' ? 'Invoice validated — within tolerance.' : `Invoice flagged: ${run.variancePct!.toFixed(2)}% deviation exceeds the ${this.store.payableRules().deviationPct}% limit.`, 5000);
  }

  async approve() {
    if (!this.ui.requires('Validate Invoice')) return;
    const r = this.run();
    if (!r) return;
    const flagged = r.status === 'Flagged for review';
    const ok = await this.ui.confirm({
      title: flagged ? 'Approve a flagged invoice?' : 'Approve for payment?',
      message: flagged ? `This invoice deviates ${r.variancePct!.toFixed(2)}% from the calculation. Approving creates a payment of ${Math.round(r.vendorInvoiceAmount!).toLocaleString()} OMR anyway.` : `A payment of ${Math.round(r.vendorInvoiceAmount!).toLocaleString()} OMR is created and tracked from Pending.`,
      confirmLabel: 'Approve', danger: flagged, icon: 'payments',
    });
    if (!ok) return;
    const p = this.store.approveInvoice(this.vendor());
    this.ui.toast(`Approved — ${p?.id} added to PO & Payment Tracking.`);
  }
}
