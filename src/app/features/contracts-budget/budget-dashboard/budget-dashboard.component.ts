import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { ChartCardComponent } from '../../../shared/components/chart-card/chart-card.component';
import { MockDataService } from '../../../core/services/mock-data.service';
import { percentUsedToLevel } from '../../../core/models/status';

@Component({
  selector: 'app-budget-dashboard',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, KpiCardComponent, ChartCardComponent],
  template: `
    <app-page-header
      title="Budget Dashboard"
      subtitle="Customer Care budget across Total, Petty Cash, Projects, Outsourcing, and OJT"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Budget Dashboard' }]"
    ></app-page-header>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <app-kpi-card label="Total Budget" [value]="totalAllocated | number:'1.0-0'" unit="OMR"></app-kpi-card>
      <app-kpi-card label="Total Spent" [value]="totalSpent | number:'1.0-0'" unit="OMR" [level]="overallLevel"></app-kpi-card>
      <app-kpi-card label="% Used" [value]="overallPct.toFixed(0)" unit="%" [level]="overallLevel"></app-kpi-card>
      <app-kpi-card label="Remaining" [value]="(totalAllocated - totalSpent) | number:'1.0-0'" unit="OMR" level="normal"></app-kpi-card>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <app-chart-card title="Budget Approval Summary" subtitle="Allocated vs. spent by category" type="bar" [data]="categoryChart"></app-chart-card>
      <app-chart-card title="OJT Budget Trend" subtitle="Monthly spend trend" type="line" [data]="ojtTrendChart"></app-chart-card>
    </div>
  `,
})
export class BudgetDashboardComponent {
  private data = inject(MockDataService);
  lines = this.data.getBudgetLines();

  get totalAllocated() { return this.lines.reduce((s, l) => s + l.allocated, 0); }
  get totalSpent() { return this.lines.reduce((s, l) => s + l.spent, 0); }
  get overallPct() { return (this.totalSpent / this.totalAllocated) * 100; }
  get overallLevel() { return percentUsedToLevel(this.overallPct); }

  categoryChart = {
    labels: ['Total Budget', 'Petty Cash', 'Projects', 'Outsourcing', 'OJT'],
    datasets: [
      { label: 'Allocated', data: [141500, 3000, 15000, 108500, 9000], backgroundColor: '#0f9c8f' },
      { label: 'Spent', data: [122965, 2870, 4100, 100700, 6200], backgroundColor: '#2d13ea' },
    ],
  };

  ojtTrendChart = {
    labels: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
    datasets: [{ label: 'OJT Spend (OMR)', data: [800, 950, 1100, 1050, 1250, 1050], borderColor: '#0e9f6e', backgroundColor: 'rgba(14,159,110,0.12)', fill: true, tension: 0.35 }],
  };
}
