import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { ChartCardComponent } from '../../../shared/components/chart-card/chart-card.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { MockDataService } from '../../../core/services/mock-data.service';
import { MovementRequest } from '../../../core/models/domain';
import { StatusLevel } from '../../../core/models/status';

@Component({
  selector: 'app-movement-dashboard',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, KpiCardComponent, ChartCardComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Movement Tracking Dashboard"
      subtitle="Status and analytics across all internal project movements"
      [breadcrumbs]="[{ label: 'Internal Project Movement' }, { label: 'Movement Dashboard' }]"
    ></app-page-header>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <app-kpi-card label="Active Movements" [value]="countByStatus('Active')" level="normal"></app-kpi-card>
      <app-kpi-card label="Ending Soon" [value]="countByStatus('Ending Soon')" level="amber"></app-kpi-card>
      <app-kpi-card label="Pending Review" [value]="countByStatus('Pending')" level="info"></app-kpi-card>
      <app-kpi-card label="Expired" [value]="countByStatus('Expired')" level="red"></app-kpi-card>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      <app-chart-card title="Approved vs. Rejected Requests" subtitle="This quarter" type="pie" [data]="approvalChart"></app-chart-card>
      <app-chart-card title="Movement Durations by Project" type="bar" [data]="durationChart"></app-chart-card>
    </div>

    <app-data-table title="Movement Summary" [columns]="columns" [rows]="requests"></app-data-table>
  `,
})
export class MovementDashboardComponent {
  private data = inject(MockDataService);
  requests: MovementRequest[] = this.data.getMovementRequests();

  countByStatus(s: MovementRequest['status']) { return this.requests.filter((r) => r.status === s).length; }

  columns: TableColumn<MovementRequest>[] = [
    { key: 'agentName', label: 'Agent' },
    { key: 'project', label: 'Project' },
    { key: 'startDate', label: 'Start Date', type: 'date' },
    { key: 'endDate', label: 'End Date', type: 'date' },
    {
      key: 'status', label: 'Status', type: 'status',
      statusFn: (r) => ({ label: r.status, level: this.level(r.status) }),
    },
  ];

  level(status: MovementRequest['status']): StatusLevel {
    const map: Record<MovementRequest['status'], StatusLevel> = { Active: 'normal', 'Ending Soon': 'amber', Expired: 'red', Pending: 'info', Rejected: 'neutral' };
    return map[status];
  }

  approvalChart = { labels: ['Approved', 'Rejected'], datasets: [{ data: [21, 6], backgroundColor: ['#0e9f6e', '#e02424'] }] };
  durationChart = {
    labels: ['Retention Growth Squad', 'Digital Channels Pilot', 'Corporate Telesales Surge'],
    datasets: [{ label: 'Avg. Duration (months)', data: [6, 3, 4], backgroundColor: '#2d13ea' }],
  };
}
