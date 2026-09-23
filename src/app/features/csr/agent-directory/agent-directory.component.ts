import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { Agent } from '../../../core/models/domain';
import { StatusLevel } from '../../../core/models/status';

const STATUS_FILTERS = ['All', 'Present', 'On Leave', 'Off', 'Absent'] as const;

import { RequiresDirective } from '../../../shared/directives/requires.directive';

@Component({
  selector: 'app-agent-directory',
  standalone: true,
  imports: [RequiresDirective, CommonModule, MatButtonModule, MatIconModule, PageHeaderComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Team & Agent Directory"
      subtitle="Outsourced and OJT workforce &middot; click a row to open the agent profile"
      [breadcrumbs]="[{ label: 'CSR Management', link: '/csr/directory' }, { label: 'Team & Agent Directory' }]"
    >
      <button mat-flat-button color="primary" (click)="addAgent()" appRequires="Manage Recruitment"><mat-icon class="!text-base !mr-1">person_add</mat-icon>Add agent</button>
    </app-page-header>

    <app-data-table [title]="'Agents · ' + periodLabel()" [columns]="columns" [rows]="rows()" (rowClick)="open($event)">
      <div toolbar class="flex items-center gap-2 flex-wrap">
        <div class="flex items-center gap-1 bg-surface-subtle border border-surface-border rounded-lg p-0.5">
          @for (s of statuses; track s) {
            <button
              (click)="status.set(s)"
              class="px-2.5 py-1 text-xs font-semibold rounded-md transition-colors"
              [class]="status() === s ? 'bg-white text-brand-700 border border-surface-border' : 'text-ink-500 hover:text-ink-900 border border-transparent'"
            >{{ s }}</button>
          }
        </div>
        @for (f of filters(); track f.key) {
          <div class="relative">
            <select (change)="f.set($any($event.target).value)" class="pl-3 pr-8 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 appearance-none focus:outline-none focus:border-brand-400" [title]="f.title">
              @for (o of f.options; track o[0]) { <option [value]="o[0]" [selected]="o[0] === f.value()">{{ o[1] }}</option> }
            </select>
            <mat-icon class="!text-base !text-ink-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">expand_more</mat-icon>
          </div>
        }
      </div>
    </app-data-table>
  `,
})
export class AgentDirectoryComponent {
  private store = inject(CrcStore);
  private router = inject(Router);
  private ui = inject(UiService);

  statuses = STATUS_FILTERS;
  status = signal<(typeof STATUS_FILTERS)[number]>('All');
  vendor = signal('All');
  vendors = ['Infoline', 'Green Umbrella', 'OJT'];
  /** 'All' = the last 12 months together, otherwise one month ('YYYY-MM'). */
  period = signal('All');
  contract = signal('All');
  private months = [...this.store.payrollMonths()].reverse();

  /** The contract an agent is billed on: their vendor's current billing contract (OJT has none). */
  private contractOf(a: Agent): string {
    const vendorName = this.store.contracts().find((c) => c.vendorName.startsWith(a.vendor))?.vendorName;
    return (vendorName && this.store.payableContracts(vendorName)[0]?.reference) || '—';
  }

  private days = computed(() => (this.period() === 'All' ? this.months : [this.period()]).flatMap((m) => {
    const [y, mo] = m.split('-').map(Number);
    return Array.from({ length: new Date(y, mo, 0).getDate() }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`);
  }));

  private all = computed(() => this.store.agents().map((a) => {
    const n = { P: 0, leave: 0, A: 0 };
    for (const d of this.days()) { const c = this.store.attendanceOn(a, d); if (c === 'P' || c === 'A') n[c]++; else if (c && c !== 'OFF') n.leave++; }
    const months = this.period() === 'All' ? this.months : [this.period()];
    return { ...a, contract: this.contractOf(a), present: n.P, leaveDays: n.leave, absent: n.A, otHours: months.reduce((s, m) => s + this.store.overtimeFor(a, m).hours, 0) };
  }));

  rows = computed(() => this.all().filter((a) => (this.status() === 'All' || a.status === this.status()) && (this.vendor() === 'All' || a.vendor === this.vendor()) && (this.contract() === 'All' || a.contract === this.contract())));

  filters = computed(() => [
    { key: 'period', title: 'Period', value: this.period, set: (v: string) => this.period.set(v), options: [['All', 'All months (last 12)'], ...this.months.map((m) => [m, this.monthLabel(m)])] },
    { key: 'vendor', title: 'Vendor', value: this.vendor, set: (v: string) => this.vendor.set(v), options: [['All', 'All vendors'], ...this.vendors.map((v) => [v, v])] },
    { key: 'contract', title: 'Contract', value: this.contract, set: (v: string) => this.contract.set(v), options: [['All', 'All contracts'], ...[...new Set(this.all().map((a) => a.contract))].sort().map((c) => [c, c === '—' ? 'No contract (OJT)' : c])] },
  ]);

  periodLabel = computed(() => (this.period() === 'All' ? `${this.monthLabel(this.months[this.months.length - 1])} – ${this.monthLabel(this.months[0])}` : this.monthLabel(this.period())));

  monthLabel(m: string) {
    const [y, mo] = m.split('-').map(Number);
    return new Date(y, mo - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  }

  columns: TableColumn<any>[] = [
    { key: 'name', label: 'Name' },
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'queue', label: 'Queue' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'contract', label: 'Contract' },
    { key: 'degree', label: 'Degree' },
    { key: 'joinDate', label: 'Join Date', type: 'date' },
    { key: 'present', label: 'Present days', type: 'number', align: 'right' },
    { key: 'leaveDays', label: 'Leave days', type: 'number', align: 'right' },
    { key: 'absent', label: 'Absent days', type: 'number', align: 'right' },
    { key: 'otHours', label: 'Overtime (h)', align: 'right', display: (r) => r.otHours.toLocaleString('en-GB') },
    {
      key: 'status', label: 'Status today', type: 'status',
      statusFn: (r) => ({ label: r.leaveType || r.status, level: this.statusLevel(r.status) }),
    },
  ];

  statusLevel(status: Agent['status']): StatusLevel {
    return status === 'Present' ? 'normal' : status === 'On Leave' ? 'amber' : status === 'Off' ? 'neutral' : 'red';
  }

  open(row: Agent) {
    this.router.navigate(['/csr/directory', row.id]);
  }

  async addAgent() {
    if (!this.ui.requires('Manage Recruitment')) return;
    const v = await this.ui.form({
      title: 'Add agent', subtitle: 'Creates the agent profile and an attendance record', icon: 'person_add', submitLabel: 'Add agent',
      values: { vendor: 'Infoline', degree: 'Diploma', nationality: 'Oman' },
      fields: [
        { key: 'name', label: 'Full name', required: true, placeholder: 'e.g. Ahmed Al-Balushi' },
        { key: 'queue', label: 'Queue', type: 'select', options: ['Sales', 'Retention', 'Complaints', 'Debt Recovery', 'Billing Complaints', 'Payment Channels Support', 'Corporate Telesales', 'Agent Experience', 'RTM', 'Hotline', 'Project', 'TRA Complaint'], required: true },
        { key: 'vendor', label: 'Vendor', type: 'select', options: this.vendors, required: true },
        { key: 'degree', label: 'Degree', type: 'select', options: ['Bachelor', 'Diploma', 'Non-Diploma'], required: true },
        { key: 'nationality', label: 'Nationality', required: true },
      ],
    });
    if (!v) return;
    const agent = this.store.addAgent({ name: v['name'], queue: v['queue'], vendor: v['vendor'], degree: v['degree'], nationality: v['nationality'] });
    this.ui.toast(`${agent.name} added — opening the profile.`);
    this.router.navigate(['/csr/directory', agent.id]);
  }
}
