import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { childRecordsFor } from '../../../core/services/contract-data';

interface ReportDef {
  title: string;
  description: string;
  icon: string;
  file: string;
  build: () => Promise<Array<Record<string, any>> | undefined> | Array<Record<string, any>>;
}

@Component({
  selector: 'app-contract-reports',
  standalone: true,
  imports: [CommonModule, MatIconModule, PageHeaderComponent],
  template: `
    <app-page-header
      title="Contract Reports"
      subtitle="Exportable reports for monthly and quarterly review — each one downloads as a CSV built from the current data"
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
          <div class="flex-1">
            <div class="text-sm font-medium text-ink-900">{{ r.title }}</div>
            <div class="text-xs text-ink-400 mt-1">{{ r.description }}</div>
          </div>
          <mat-icon class="!text-lg !text-ink-400">download</mat-icon>
        </button>
      }
    </div>
  `,
})
export class ContractReportsComponent {
  private store = inject(CrcStore);
  private ui = inject(UiService);

  private base = (c: any) => ({ Reference: c.reference, Name: c.name, Vendor: c.vendorName, Type: c.contractType, 'End date': c.endDate, 'Days remaining': c.daysRemaining, Amount: c.amount, Currency: c.currency, Status: c.status, 'Renewal status': c.renewalStatus ?? '' });

  reports: ReportDef[] = [
    {
      title: 'Contracts Expiring in Period', description: 'All contracts expiring within a selected date range.', icon: 'event_busy', file: 'contracts-expiring',
      build: async () => {
        const today = new Date().toISOString().slice(0, 10);
        const to = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
        const v = await this.ui.form({
          title: 'Contracts expiring in period', subtitle: 'Choose the end-date range to report on', icon: 'event_busy', submitLabel: 'Generate report',
          values: { from: today, to },
          fields: [{ key: 'from', label: 'From', type: 'date', required: true }, { key: 'to', label: 'To', type: 'date', required: true }],
        });
        if (!v) return undefined;
        return this.store.contracts().filter((c) => c.endDate >= v['from'] && c.endDate <= v['to']).map(this.base);
      },
    },
    { title: 'Expired Contracts', description: 'Contracts past their end date, with renewal status.', icon: 'history_toggle_off', file: 'contracts-expired', build: () => this.store.contracts().filter((c) => c.status === 'Expired').map(this.base) },
    {
      title: 'Contracts by Vendor', description: 'Contract count and value grouped by vendor.', icon: 'store', file: 'contracts-by-vendor',
      build: () => this.group((c) => c.vendorName, 'Vendor'),
    },
    {
      title: 'Contracts by Type', description: 'Breakdown by contract classification.', icon: 'category', file: 'contracts-by-type',
      build: () => this.group((c) => c.contractType, 'Type'),
    },
    {
      title: 'Contract vs PO Value', description: 'Compare parent contract amount to total PO value.', icon: 'compare_arrows', file: 'contract-vs-po',
      build: () => this.store.contracts().map((p) => {
        const pos = childRecordsFor(p).filter((k) => k.recordType === 'Purchase Order');
        const posTotal = pos.reduce((s, k) => s + k.amount, 0);
        return { Contract: p.reference, Vendor: p.vendorName, 'Contract amount': p.amount, 'Purchase orders': pos.length, 'PO value': posTotal, 'Remaining headroom': p.amount - posTotal };
      }),
    },
    { title: 'Renewed & Extended Contracts', description: 'Contracts renewed or extended this period.', icon: 'autorenew', file: 'contracts-renewed', build: () => this.store.contracts().filter((c) => !!c.renewalStatus).map(this.base) },
    { title: 'Unresolved & Escalated Contracts', description: 'Contracts with open monitoring actions or escalations.', icon: 'report', file: 'contracts-unresolved', build: () => this.store.contracts().filter((c) => (c.status === 'Expired' || c.status === 'Expiring Soon') && c.renewalStatus !== 'Renewed').map((c) => ({ ...this.base(c), Escalation: c.daysRemaining <= 5 ? 'Escalated to senior management' : 'Monitoring' })) },
    { title: 'Synchronization Errors', description: 'All sync failures and their resolution status.', icon: 'sync_problem', file: 'sync-errors', build: () => this.store.syncRuns().filter((r) => r.status === 'Failed').map((r) => ({ Started: r.startedAt, Finished: r.finishedAt, Type: r.type, 'Initiated by': r.initiatedBy, Status: r.status, Resolution: 'Retried by next scheduled sync' })) },
    {
      title: 'Notification Delivery History', description: 'Email/SMS/in-app delivery log for expiry alerts.', icon: 'mark_email_read', file: 'notification-delivery',
      build: () => this.store.audit().filter((a) => /notif|escalation|alert/i.test(a.activityType)).map((a) => ({ Timestamp: a.timestamp, Activity: a.activityType, Reference: a.reference, Actor: a.actor, Result: a.result, Details: a.details })),
    },
  ];

  private group(key: (c: any) => string, label: string) {
    const map = new Map<string, { count: number; value: number }>();
    for (const c of this.store.contracts()) {
      const k = key(c);
      const cur = map.get(k) ?? { count: 0, value: 0 };
      map.set(k, { count: cur.count + 1, value: cur.value + c.amount });
    }
    return [...map.entries()].map(([k, v]) => ({ [label]: k, Contracts: v.count, 'Total value (OMR)': v.value }));
  }

  async generate(report: ReportDef) {
    const rows = await report.build();
    if (!rows) return;
    if (!rows.length) {
      this.ui.toast(`"${report.title}" has no rows for the current data.`);
      return;
    }
    this.ui.csv(report.file, rows);
    this.store.log('Report Generated', report.file, `${report.title}: ${rows.length} row(s) exported.`);
  }
}
