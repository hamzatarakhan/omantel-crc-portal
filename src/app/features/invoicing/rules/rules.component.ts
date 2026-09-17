import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-rules',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatSlideToggleModule, PageHeaderComponent],
  template: `
    <app-page-header
      title="Payable Rule Configuration"
      subtitle="Configure the minimum call-duration threshold and other payable calculation parameters"
      [breadcrumbs]="[{ label: 'Invoicing & Payments', link: '/invoicing/dashboard' }, { label: 'Payable Rule Configuration' }]"
    ></app-page-header>

    <div class="surface-card p-5 max-w-xl flex flex-col gap-5">
      <div>
        <label class="text-sm font-medium text-ink-700 block mb-1">Minimum Call Duration Threshold</label>
        <p class="text-xs text-ink-400 mb-2">Calls shorter than this are excluded from payable hours during WFO sync.</p>
        <div class="flex items-center gap-2">
          <input type="number" class="w-24 border border-surface-border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-brand-400 transition-colors" [(ngModel)]="thresholdSeconds" min="0" />
          <span class="text-sm text-ink-500">seconds</span>
        </div>
      </div>

      <div>
        <label class="text-sm font-medium text-ink-700 block mb-1">Payment Deviation Review Threshold</label>
        <p class="text-xs text-ink-400 mb-2">Flag a calculated payment for review if it deviates from the historical average by more than this percentage.</p>
        <div class="flex items-center gap-2">
          <input type="number" class="w-24 border border-surface-border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-brand-400 transition-colors" [(ngModel)]="deviationPct" min="0" />
          <span class="text-sm text-ink-500">%</span>
        </div>
      </div>

      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium text-ink-700">Apply threshold per vendor</div>
          <div class="text-xs text-ink-400">When off, the threshold above applies globally to all vendors.</div>
        </div>
        <mat-slide-toggle [(ngModel)]="perVendor"></mat-slide-toggle>
      </div>

      <button mat-flat-button color="primary" class="self-start" (click)="save()">Save Configuration</button>
    </div>
  `,
})
export class RulesComponent {
  thresholdSeconds = 10;
  deviationPct = 15;
  perVendor = false;

  constructor(private snack: MatSnackBar) {}

  save() {
    this.snack.open('Payable rule configuration saved.', 'Dismiss', { duration: 3000 });
  }
}
