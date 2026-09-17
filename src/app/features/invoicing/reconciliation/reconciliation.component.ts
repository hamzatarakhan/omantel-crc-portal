import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { MockDataService } from '../../../core/services/mock-data.service';
import { PayableLine } from '../../../core/models/domain';

@Component({
  selector: 'app-reconciliation',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, PageHeaderComponent, StatusChipComponent],
  template: `
    <app-page-header
      title="Reconciliation Workspace"
      subtitle="Payable calculation from synced WFO attendance/overtime + 3 Clicks incentives, for validating the vendor invoice"
      [breadcrumbs]="[{ label: 'Invoicing & Payments', link: '/invoicing/dashboard' }, { label: 'Reconciliation Workspace' }]"
    >
      @if (validated()) {
        <app-status-chip label="Validated" level="normal"></app-status-chip>
      }
      <button mat-flat-button color="primary" (click)="validate()" [disabled]="validated()">
        <mat-icon class="!text-base !mr-1">check_circle</mat-icon>
        {{ validated() ? 'Validated' : 'Validate Invoice' }}
      </button>
    </app-page-header>

    <div class="surface-card overflow-x-auto mb-6">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide">
            <th class="px-4 py-2.5 font-medium">Tier</th>
            <th class="px-4 py-2.5 font-medium text-right">Basic</th>
            <th class="px-4 py-2.5 font-medium text-right">HRA</th>
            <th class="px-4 py-2.5 font-medium text-right">Conveyance</th>
            <th class="px-4 py-2.5 font-medium text-right">Special Allow.</th>
            <th class="px-4 py-2.5 font-medium text-right">Gross</th>
            <th class="px-4 py-2.5 font-medium text-right">Mgmt Fee</th>
            <th class="px-4 py-2.5 font-medium text-right">Additions</th>
            <th class="px-4 py-2.5 font-medium text-right">Deductions</th>
            <th class="px-4 py-2.5 font-medium text-right">Billing Rate</th>
          </tr>
        </thead>
        <tbody>
          @for (line of lines; track line.employeeName) {
            <tr class="border-t border-surface-border">
              <td class="px-4 py-2 font-medium text-ink-700">{{ line.employeeName }}</td>
              <td class="px-4 py-2 text-right">{{ line.basic | number:'1.2-2' }}</td>
              <td class="px-4 py-2 text-right">{{ line.hra | number:'1.2-2' }}</td>
              <td class="px-4 py-2 text-right">{{ line.conveyance | number:'1.2-2' }}</td>
              <td class="px-4 py-2 text-right">{{ line.specialAllowance | number:'1.2-2' }}</td>
              <td class="px-4 py-2 text-right font-medium">{{ line.gross | number:'1.2-2' }}</td>
              <td class="px-4 py-2 text-right">{{ line.managementFee | number:'1.2-2' }}</td>
              <td class="px-4 py-2 text-right text-status-normal">+{{ line.additions | number:'1.2-2' }}</td>
              <td class="px-4 py-2 text-right text-status-red">-{{ line.deductions | number:'1.2-2' }}</td>
              <td class="px-4 py-2 text-right font-semibold text-brand-700">{{ line.billingRate | number:'1.2-2' }}</td>
            </tr>
          }
        </tbody>
        <tfoot>
          <tr class="border-t-2 border-surface-border font-semibold">
            <td class="px-4 py-2.5" colspan="9">Total Billing (OMR)</td>
            <td class="px-4 py-2.5 text-right text-brand-700">{{ total | number:'1.2-2' }}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="surface-card p-4 flex items-start gap-3">
      <mat-icon class="!text-ink-400">receipt_long</mat-icon>
      <div class="text-xs text-ink-500">
        Calls below the configured minimum call-duration threshold have already been excluded from payable hours (see <a class="text-brand-600" href="/invoicing/rules">Payable Rule Configuration</a>).
        Vendor-submitted invoice: <span class="font-medium text-ink-700">{{ (total * 1.05) | number:'1.2-2' }} OMR</span> (incl. 5% VAT) &mdash; matches within tolerance.
        @if (validated()) {
          <span class="text-status-normal font-medium">Validated on {{ validatedAt() }}.</span>
        }
      </div>
    </div>
  `,
})
export class ReconciliationComponent {
  private data = inject(MockDataService);
  lines: PayableLine[] = this.data.getPayableLines();
  get total() { return this.lines.reduce((s, l) => s + l.billingRate, 0); }

  validated = signal(false);
  validatedAt = signal('');

  validate() {
    this.validated.set(true);
    this.validatedAt.set(new Date().toLocaleString());
  }
}
