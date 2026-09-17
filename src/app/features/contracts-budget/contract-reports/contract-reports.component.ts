import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

interface ReportDef { title: string; description: string; icon: string; }

@Component({
  selector: 'app-contract-reports',
  standalone: true,
  imports: [CommonModule, MatIconModule, PageHeaderComponent],
  template: `
    <app-page-header
      title="Contract Reports"
      subtitle="Exportable reports for monthly and quarterly review"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Contract Reports' }]"
    ></app-page-header>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      @for (r of reports; track r.title) {
        <button
          (click)="generate(r)"
          class="surface-card p-4 text-left hover:border-brand-300 transition-colors flex items-start gap-3"
        >
          <div class="w-9 h-9 rounded-md bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
            <mat-icon class="!text-lg">{{ r.icon }}</mat-icon>
          </div>
          <div>
            <div class="text-sm font-medium text-ink-900">{{ r.title }}</div>
            <div class="text-xs text-ink-400 mt-1">{{ r.description }}</div>
          </div>
        </button>
      }
    </div>
  `,
})
export class ContractReportsComponent {
  private snack = inject(MatSnackBar);

  reports: ReportDef[] = [
    { title: 'Contracts Expiring in Period', description: 'All contracts expiring within a selected date range.', icon: 'event_busy' },
    { title: 'Expired Contracts', description: 'Contracts past their end date, with renewal status.', icon: 'history_toggle_off' },
    { title: 'Contracts by Vendor', description: 'Contract count and value grouped by vendor.', icon: 'store' },
    { title: 'Contracts by Type', description: 'Breakdown by contract classification.', icon: 'category' },
    { title: 'Contract vs PO Value', description: 'Compare parent contract amount to total PO value.', icon: 'compare_arrows' },
    { title: 'Renewed & Extended Contracts', description: 'Contracts renewed or extended this period.', icon: 'autorenew' },
    { title: 'Unresolved & Escalated Contracts', description: 'Contracts with open monitoring actions or escalations.', icon: 'report' },
    { title: 'Synchronization Errors', description: 'All sync failures and their resolution status.', icon: 'sync_problem' },
    { title: 'Notification Delivery History', description: 'Email/SMS/in-app delivery log for expiry alerts.', icon: 'mark_email_read' },
  ];

  generate(report: ReportDef) {
    this.snack.open(`Generating "${report.title}"… it will download as a CSV shortly.`, 'Dismiss', { duration: 3000 });
  }
}
