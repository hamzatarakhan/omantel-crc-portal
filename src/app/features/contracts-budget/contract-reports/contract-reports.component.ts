import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { ContractOps } from '../../../core/services/contract-ops.service';
import { UiService } from '../../../shared/services/ui.service';
import { requiredActionFor } from '../../../core/services/contract-monitoring';

type Rows = Array<Record<string, any>>;
interface ReportDef {
  title: string;
  description: string;
  icon: string;
  file: string;
  build: () => Promise<Rows | undefined> | Rows;
}

@Component({
  selector: 'app-contract-reports',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatMenuModule, PageHeaderComponent],
  template: `
    <app-page-header
      title="Contract Reports"
      subtitle="Reports for monthly and quarterly review — use Export to download each one as CSV or Excel, built from the current data"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Contract Reports' }]"
    ></app-page-header>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      @for (r of reports; track r.title) {
        <div class="surface-card p-4 flex items-start gap-3">
          <div class="w-9 h-9 rounded-md bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
            <mat-icon class="!text-lg">{{ r.icon }}</mat-icon>
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-ink-900">{{ r.title }}</div>
            <div class="text-xs text-ink-400 mt-1">{{ r.description }}</div>
            <button type="button" [matMenuTriggerFor]="exportMenu" class="mt-3 group flex items-center gap-2 text-xs font-semibold text-brand-700 bg-brand-50 border border-brand-100 hover:bg-brand-100 hover:border-brand-200 active:scale-[0.97] rounded-lg pl-2.5 pr-2 py-2 transition-all shrink-0" [class.opacity-50]="!store.can('Export Contract Data')">
              <span class="w-5 h-5 rounded-md bg-white/70 group-hover:bg-white flex items-center justify-center shrink-0 transition-colors"><mat-icon class="!text-[15px] !w-[15px] !h-[15px] !leading-[15px]">file_download</mat-icon></span>
              Export
              <mat-icon class="!text-[18px] !w-[18px] !h-[18px] !leading-[18px] text-brand-500">expand_more</mat-icon>
            </button>
            <mat-menu #exportMenu="matMenu" xPosition="before">
            <button mat-menu-item (click)="generate(r, 'csv')"><mat-icon>file_download</mat-icon><span>CSV file (.csv)</span></button>
            <button mat-menu-item (click)="generate(r, 'xlsx')"><mat-icon>table_view</mat-icon><span>Excel workbook (.xlsx)</span></button>
          </mat-menu>
          </div>
        </div>
      }
    </div>
  `,
})
export class ContractReportsComponent {
  store = inject(CrcStore);
  private ops = inject(ContractOps);
  private ui = inject(UiService);

  private base = (c: any) => ({ Reference: c.reference, Name: c.name, Vendor: c.vendorName, Type: c.contractType, 'End date': c.endDate, 'Days remaining': c.daysRemaining, Amount: c.amount, Currency: c.currency, Status: c.status, 'Renewal status': c.renewalStatus ?? '', 'ERP reference': c.erpReference });
  private live = () => this.ops.active();

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
        return this.live().filter((c) => c.endDate >= v['from'] && c.endDate <= v['to']).map(this.base);
      },
    },
    { title: 'Expired Contracts', description: 'Contracts past their end date, with renewal status.', icon: 'history_toggle_off', file: 'contracts-expired', build: () => this.live().filter((c) => c.status === 'Expired').map(this.base) },
    { title: 'Contracts by Vendor', description: 'Contract count and value grouped by vendor.', icon: 'store', file: 'contracts-by-vendor', build: () => this.group((c) => c.vendorName, 'Vendor') },
    { title: 'Contracts by Type', description: 'Breakdown by contract classification.', icon: 'category', file: 'contracts-by-type', build: () => this.group((c) => c.contractType, 'Type') },
    {
      title: 'Contract vs PO Value', description: 'Compare parent contract amount to total PO value, and flag contracts for review.', icon: 'compare_arrows', file: 'contract-vs-po',
      build: () => this.live().map((p) => {
        const pos = this.ops.childrenOf(p).filter((k) => k.recordType === 'Purchase Order');
        const posTotal = pos.reduce((s, k) => s + k.amount, 0);
        const issues = this.ops.issuesFor(p);
        return { Contract: p.reference, Vendor: p.vendorName, 'Contract amount': p.amount, 'Purchase orders': pos.length, 'PO value': posTotal, 'Remaining headroom': p.amount - posTotal, 'Review flag': issues.map((i) => i.code).join(', ') || 'OK' };
      }),
    },
    { title: 'Renewed & Extended Contracts', description: 'Contracts renewed or extended this period.', icon: 'autorenew', file: 'contracts-renewed', build: () => this.live().filter((c) => !!c.renewalStatus).map((c) => ({ ...this.base(c), 'Time extensions': this.ops.childrenOf(c).filter((k) => k.recordType === 'Time Extension').length })) },
    {
      title: 'Unresolved Contracts', description: 'Contracts expiring or expired with no resolution recorded, and their open monitoring actions.', icon: 'report', file: 'contracts-unresolved',
      build: () => this.live().filter((c) => this.ops.isUnresolved(c)).map((c) => ({ ...this.base(c), 'Escalation status': this.ops.escalationStatus(c), 'Required action': requiredActionFor(c), 'Open actions': this.ops.openActions(c).length })),
    },
    {
      title: 'Escalated Contracts', description: 'Contracts escalated to senior management, with the resolution history.', icon: 'priority_high', file: 'contracts-escalated',
      build: () => this.live().flatMap((c) => this.ops.escalationHistory(c).map((e) => ({ Contract: c.reference, Vendor: c.vendorName, 'Escalation date': e.at, Reason: e.reason, Recipients: e.recipients, 'Resolution status': e.status, 'Resolution date': e.resolutionDate ?? '', Comments: e.comments, 'Recorded by': e.by }))),
    },
    {
      title: 'Synchronization Errors', description: 'All sync failures and rejected records with category and resolution status.', icon: 'sync_problem', file: 'sync-errors',
      build: () => this.ops.errorLog().map((e) => ({ 'Synchronization type': e.syncType, 'Date & time': e.at, 'Contract reference': e.contractReference, 'ERP reference': e.erpReference, 'Initiated by': e.initiatedBy, 'Error message': e.message, Category: e.category, 'Processing status': e.processing, 'Resolution status': e.resolution, 'Resolution note': e.resolutionNote ?? '' })),
    },
    {
      title: 'Notification Delivery History', description: 'Email/SMS/in-app delivery log for expiry alerts and escalations.', icon: 'mark_email_read', file: 'notification-delivery',
      build: () => this.store.audit().filter((a) => /notif|escalation|alert/i.test(a.activityType)).map((a) => ({ Timestamp: a.timestamp, Activity: a.activityType, Reference: a.reference, Actor: a.actor, Result: a.result, Details: a.details })),
    },
    {
      title: 'Historical Contracts', description: 'Contracts cancelled in the ERP, kept for historical reporting.', icon: 'inventory_2', file: 'contracts-historical',
      build: () => this.ops.historical().map((c) => ({ ...this.base(c), 'ERP status': c.erpStatus ?? '' })),
    },
  ];

  private group(key: (c: any) => string, label: string): Rows {
    const map = new Map<string, { count: number; value: number }>();
    for (const c of this.live()) {
      const k = key(c);
      const cur = map.get(k) ?? { count: 0, value: 0 };
      map.set(k, { count: cur.count + 1, value: cur.value + c.amount });
    }
    return [...map.entries()].map(([k, v]) => ({ [label]: k, Contracts: v.count, 'Total value (OMR)': v.value }));
  }

  async generate(report: ReportDef, format: 'csv' | 'xlsx') {
    if (!this.ui.requires('Export Contract Data')) return;
    const rows = await report.build();
    if (!rows) return;
    if (!rows.length) {
      this.ui.toast(`"${report.title}" has no rows for the current data.`);
      return;
    }
    if (format === 'csv') this.ui.csv(report.file, rows);
    else this.ui.xlsx(report.file, rows, report.title);
    this.store.log('Report Generated', report.file, `${report.title}: ${rows.length} row(s) exported.`);
  }
}
