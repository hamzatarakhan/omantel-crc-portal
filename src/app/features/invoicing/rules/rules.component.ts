import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';

const FIELD = 'w-24 border border-surface-border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-brand-400 transition-colors';

import { RequiresDirective } from '../../../shared/directives/requires.directive';

@Component({
  selector: 'app-rules',
  standalone: true,
  imports: [RequiresDirective, CommonModule, FormsModule, RouterModule, MatButtonModule, MatSlideToggleModule, PageHeaderComponent],
  template: `
    <app-page-header
      title="Payable Rule Configuration"
      subtitle="Configure the minimum call-duration threshold and other payable calculation parameters"
      [breadcrumbs]="[{ label: 'Invoicing & Payments', link: '/invoicing/dashboard' }, { label: 'Payable Rule Configuration' }]"
    ></app-page-header>

    <div class="surface-card p-5 max-w-xl flex flex-col gap-5">
      <div>
        <label class="text-sm font-medium text-ink-700 block mb-1">Minimum Call Duration Threshold</label>
        <p class="text-xs text-ink-400 mb-2">Calls shorter than this are excluded from the incentive calculation during the WFO / 3 Clicks sync.</p>
        <div class="flex items-center gap-2">
          <input type="number" class="${FIELD}" [ngModel]="threshold()" (ngModelChange)="threshold.set(+$event || 0)" min="0" max="60" />
          <span class="text-sm text-ink-500">seconds</span>
        </div>
      </div>

      <div>
        <label class="text-sm font-medium text-ink-700 block mb-1">Invoice Deviation Review Threshold</label>
        <p class="text-xs text-ink-400 mb-2">Flag a vendor invoice for review if it deviates from the calculated payable by more than this percentage.</p>
        <div class="flex items-center gap-2">
          <input type="number" class="${FIELD}" [ngModel]="deviation()" (ngModelChange)="deviation.set(+$event || 0)" min="0" step="0.5" />
          <span class="text-sm text-ink-500">%</span>
        </div>
      </div>

      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium text-ink-700">Apply threshold per vendor</div>
          <div class="text-xs text-ink-400">When off, the threshold above applies globally to all vendors.</div>
        </div>
        <mat-slide-toggle [ngModel]="perVendor()" (ngModelChange)="perVendor.set($event)"></mat-slide-toggle>
      </div>

      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium text-ink-700">Bill the 3 Clicks incentive on this invoice</div>
          <div class="text-xs text-ink-400">Off matches the vendor's current tax invoice, which has no incentive line. When off, the incentive is still calculated and shown, but not added to the total.</div>
        </div>
        <mat-slide-toggle [ngModel]="includeIncentive()" (ngModelChange)="includeIncentive.set($event)"></mat-slide-toggle>
      </div>

      @if (dirty()) {
        <p class="text-xs text-status-amber font-medium">Unsaved changes. Saving resets any invoice validation so the payable is recalculated with the new rules.</p>
      }
      <div class="flex items-center gap-2">
        <button mat-flat-button color="primary" (click)="save()" appRequires="Configure Payable Rules" [disabled]="!dirty()">Save Configuration</button>
        <button mat-button (click)="reset()" [disabled]="!dirty()">Discard</button>
        <a class="text-xs text-brand-600 font-semibold ml-auto" routerLink="/invoicing/reconciliation">Open Reconciliation Workspace →</a>
      </div>
    </div>
  `,
})
export class RulesComponent {
  private store = inject(CrcStore);
  private ui = inject(UiService);

  threshold = signal(this.store.payableRules().thresholdSeconds);
  deviation = signal(this.store.payableRules().deviationPct);
  perVendor = signal(this.store.payableRules().perVendor);
  includeIncentive = signal(this.store.payableRules().includeIncentive);

  dirty = computed(() => {
    const r = this.store.payableRules();
    return r.thresholdSeconds !== this.threshold() || r.deviationPct !== this.deviation() || r.perVendor !== this.perVendor() || r.includeIncentive !== this.includeIncentive();
  });

  save() {
    if (!this.ui.requires('Configure Payable Rules')) return;
    this.store.savePayableRules({ thresholdSeconds: this.threshold(), deviationPct: this.deviation(), perVendor: this.perVendor(), includeIncentive: this.includeIncentive() });
    this.ui.toast('Payable rule configuration saved — invoices will be recalculated.');
  }

  reset() {
    const r = this.store.payableRules();
    this.threshold.set(r.thresholdSeconds);
    this.deviation.set(r.deviationPct);
    this.perVendor.set(r.perVendor);
    this.includeIncentive.set(r.includeIncentive);
  }
}
