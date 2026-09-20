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

    <app-data-table title="Agents" [columns]="columns" [rows]="rows()" (rowClick)="open($event)">
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
        <div class="relative">
          <select [value]="vendor()" (change)="vendor.set($any($event.target).value)" class="pl-3 pr-8 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 appearance-none focus:outline-none focus:border-brand-400">
            <option value="All">All vendors</option>
            @for (v of vendors; track v) { <option [value]="v">{{ v }}</option> }
          </select>
          <mat-icon class="!text-base !text-ink-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">expand_more</mat-icon>
        </div>
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

  rows = computed(() => this.store.agents().filter((a) => (this.status() === 'All' || a.status === this.status()) && (this.vendor() === 'All' || a.vendor === this.vendor())));

  columns: TableColumn<Agent>[] = [
    { key: 'name', label: 'Name' },
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'queue', label: 'Queue' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'degree', label: 'Degree' },
    { key: 'joinDate', label: 'Join Date', type: 'date' },
    {
      key: 'status', label: 'Status', type: 'status',
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
