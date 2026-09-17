import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { MockDataService } from '../../../core/services/mock-data.service';
import { Agent } from '../../../core/models/domain';

const LEAVE_LEGEND: Array<{ code: string; meaning: string; notes?: string }> = [
  { code: 'P', meaning: 'Presence' },
  { code: 'OFF', meaning: 'Off day' },
  { code: 'A', meaning: 'Absence' },
  { code: 'S/L', meaning: 'Sick Leave' },
  { code: 'M/L', meaning: 'Maternity Leave', notes: '98 days' },
  { code: 'P/L', meaning: 'Paternity Leave', notes: '7 days' },
  { code: 'C/L', meaning: 'Annual / Exception Leave' },
  { code: 'SP', meaning: 'Compassionate / Family Leave', notes: 'Bereavement, marriage' },
  { code: 'ST/L', meaning: 'Study Leave', notes: '15 days' },
  { code: 'AS', meaning: 'Accompanying Sick Family Member', notes: '15 days' },
];

@Component({
  selector: 'app-leave-management',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Leave Management"
      subtitle="Leave data synced from the Workforce (WFO) system &middot; reclassify type or add a note without altering the source"
      [breadcrumbs]="[{ label: 'CSR Management', link: '/csr/directory' }, { label: 'Leave Management' }]"
    ></app-page-header>

    <div class="surface-card p-4 mb-6">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-ink-500 mb-3">Leave Code Legend</h3>
      <div class="flex flex-wrap gap-2">
        @for (l of legend; track l.code) {
          <span class="text-xs bg-surface-subtle border border-surface-border rounded-full px-3 py-1">
            <span class="font-semibold">{{ l.code }}</span> &mdash; {{ l.meaning }}@if (l.notes) {<span class="text-ink-400"> ({{ l.notes }})</span>}
          </span>
        }
      </div>
    </div>

    <app-data-table [columns]="columns" [rows]="onLeave" emptyTitle="No one is on leave today" emptyDescription="All agents are scheduled as present or off."></app-data-table>
  `,
})
export class LeaveManagementComponent {
  private data = inject(MockDataService);
  legend = LEAVE_LEGEND;
  onLeave: Agent[] = this.data.getAgents(48).filter((a) => a.status === 'On Leave');

  columns: TableColumn<Agent>[] = [
    { key: 'name', label: 'Agent' },
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'queue', label: 'Queue' },
    {
      key: 'leaveType', label: 'Leave Type', type: 'status',
      statusFn: (r) => ({ label: r.leaveType || '—', level: 'amber' }),
    },
  ];
}
