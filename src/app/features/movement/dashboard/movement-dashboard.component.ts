import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { ChartCardComponent } from '../../../shared/components/chart-card/chart-card.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { MovementRequest } from '../../../core/models/domain';
import { StatusLevel } from '../../../core/models/status';

@Component({
  selector: 'app-movement-dashboard',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, KpiCardComponent, ChartCardComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Movement Tracking Dashboard"
      subtitle="Status and analytics across all internal project movements &middot; click a row to open the agent"
      [breadcrumbs]="[{ label: 'Internal Project Movement' }, { label: 'Movement Dashboard' }]"
    ></app-page-header>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <app-kpi-card label="Active Movements" [value]="count('Active')" level="normal"></app-kpi-card>
      <app-kpi-card label="Ending Soon" [value]="count('Ending Soon')" level="amber"></app-kpi-card>
      <app-kpi-card label="Pending Review" [value]="count('Pending')" level="info"></app-kpi-card>
      <app-kpi-card label="Expired" [value]="count('Expired')" level="red"></app-kpi-card>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      <app-chart-card title="Approved vs. Rejected Requests" subtitle="All decided requests" type="pie" [data]="approvalChart()"></app-chart-card>
      <app-chart-card title="Movement Durations by Project" type="bar" [data]="durationChart()"></app-chart-card>
    </div>

    <app-data-table title="Movement Summary" [columns]="columns" [rows]="rows()" (rowClick)="open($event)"></app-data-table>
  `,
})
export class MovementDashboardComponent {
  private store = inject(CrcStore);
  private router = inject(Router);

  /** Approved movements age into "Ending Soon" (≤14 days left) and "Expired" (past end date). */
  rows = computed<MovementRequest[]>(() => {
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    return this.store.movementRequests().map((r) => {
      if (r.status === 'Pending' || r.status === 'Rejected') return r;
      return { ...r, status: r.endDate < today ? 'Expired' : r.endDate <= soon ? 'Ending Soon' : 'Active' } as MovementRequest;
    });
  });

  count(s: MovementRequest['status']) {
    return this.rows().filter((r) => r.status === s).length;
  }

  columns: TableColumn<MovementRequest>[] = [
    { key: 'agentName', label: 'Agent' },
    { key: 'project', label: 'Project' },
    { key: 'startDate', label: 'Start Date', type: 'date' },
    { key: 'endDate', label: 'End Date', type: 'date' },
    { key: 'status', label: 'Status', type: 'status', statusFn: (r) => ({ label: r.status, level: this.level(r.status) }) },
  ];

  level(status: MovementRequest['status']): StatusLevel {
    const map: Record<MovementRequest['status'], StatusLevel> = { Active: 'normal', 'Ending Soon': 'amber', Expired: 'red', Pending: 'info', Rejected: 'neutral' };
    return map[status];
  }

  approvalChart = computed(() => {
    const rows = this.rows();
    return { labels: ['Approved', 'Rejected'], datasets: [{ data: [rows.filter((r) => ['Active', 'Ending Soon', 'Expired'].includes(r.status)).length, rows.filter((r) => r.status === 'Rejected').length], backgroundColor: ['#0e9f6e', '#e02424'] }] };
  });

  durationChart = computed(() => {
    const byProject = new Map<string, number[]>();
    for (const r of this.rows()) {
      const months = Math.max(1, Math.round((new Date(r.endDate).getTime() - new Date(r.startDate).getTime()) / (30 * 86400000)));
      byProject.set(r.project, [...(byProject.get(r.project) ?? []), months]);
    }
    return {
      labels: [...byProject.keys()],
      datasets: [{ label: 'Avg. Duration (months)', data: [...byProject.values()].map((v) => Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10), backgroundColor: '#2d13ea' }],
    };
  });

  open(row: MovementRequest) {
    if (row.agentId) this.router.navigate(['/csr/directory', row.agentId]);
  }
}
