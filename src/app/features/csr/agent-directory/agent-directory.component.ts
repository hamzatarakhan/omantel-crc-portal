import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { MockDataService } from '../../../core/services/mock-data.service';
import { Agent } from '../../../core/models/domain';
import { StatusLevel } from '../../../core/models/status';

@Component({
  selector: 'app-agent-directory',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Team & Agent Directory"
      subtitle="Outsourced and OJT workforce &middot; click a row to open the agent profile"
      [breadcrumbs]="[{ label: 'CSR Management', link: '/csr/directory' }, { label: 'Team & Agent Directory' }]"
    ></app-page-header>
    <app-data-table [columns]="columns" [rows]="agents" (rowClick)="open($event)"></app-data-table>
  `,
})
export class AgentDirectoryComponent {
  private data = inject(MockDataService);
  agents: Agent[] = this.data.getAgents(48);

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

  constructor(private router: Router) {}

  open(row: Agent) {
    this.router.navigate(['/csr/directory', row.id]);
  }
}
