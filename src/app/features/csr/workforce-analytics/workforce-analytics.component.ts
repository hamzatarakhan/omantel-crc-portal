import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { ChartCardComponent } from '../../../shared/components/chart-card/chart-card.component';
import { MockDataService } from '../../../core/services/mock-data.service';

@Component({
  selector: 'app-workforce-analytics',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, KpiCardComponent, ChartCardComponent],
  template: `
    <app-page-header
      title="Workforce Analytics"
      subtitle="Headcount, resignation, recruitment, and overtime trends pulled from the Workforce (WFO) system"
      [breadcrumbs]="[{ label: 'CSR Management', link: '/csr/directory' }, { label: 'Workforce Analytics' }]"
    ></app-page-header>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <app-kpi-card label="Total Workforce" [value]="totalWorkforce" icon="groups"></app-kpi-card>
      <app-kpi-card label="Resignation Rate (mo.)" [value]="resignationRate + '%'" level="amber" icon="logout"></app-kpi-card>
      <app-kpi-card label="Open Requisitions" [value]="9" level="info" icon="assignment"></app-kpi-card>
      <app-kpi-card label="Avg. RFT (days)" [value]="14" icon="timer"></app-kpi-card>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      <app-chart-card title="Workforce Summary" subtitle="Infoline | Green Umbrella | OJT" type="bar" [data]="workforceChart"></app-chart-card>
      <app-chart-card title="Resignations Over Time" type="line" [data]="resignationChart"></app-chart-card>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <app-chart-card title="Overtime by Queue" type="bar" [data]="overtimeChart"></app-chart-card>
      <app-chart-card title="Attendance Today" type="pie" [data]="attendanceChart"></app-chart-card>
    </div>
  `,
})
export class WorkforceAnalyticsComponent {
  private data = inject(MockDataService);
  snapshots = this.data.getWorkforceSnapshots();
  get totalWorkforce() {
    const last = this.snapshots[this.snapshots.length - 1];
    return last.infoline + last.greenUmbrella + last.ojt;
  }
  get resignationRate() {
    const last = this.snapshots[this.snapshots.length - 1];
    return ((last.resignations / this.totalWorkforce) * 100).toFixed(1);
  }

  workforceChart = {
    labels: this.snapshots.map((s) => s.month),
    datasets: [
      { label: 'Infoline', data: this.snapshots.map((s) => s.infoline), backgroundColor: '#2d13ea' },
      { label: 'Green Umbrella', data: this.snapshots.map((s) => s.greenUmbrella), backgroundColor: '#ea6e00' },
      { label: 'OJT', data: this.snapshots.map((s) => s.ojt), backgroundColor: '#0f9c8f' },
    ],
  };

  resignationChart = {
    labels: this.snapshots.map((s) => s.month),
    datasets: [{ label: 'Resignations', data: this.snapshots.map((s) => s.resignations), borderColor: '#e02424', backgroundColor: 'rgba(224,36,36,0.12)', fill: true, tension: 0.35 }],
  };

  overtimeChart = {
    labels: ['Sales', 'Retention', 'Complaints', 'Debt Recovery', 'Billing Complaints'],
    datasets: [{ label: 'Overtime Hours', data: [120, 95, 60, 40, 55], backgroundColor: '#e3a008' }],
  };

  attendanceChart = {
    labels: ['Present', 'On Leave', 'Off', 'Absent'],
    datasets: [{ data: [172, 14, 22, 3], backgroundColor: ['#0e9f6e', '#e3a008', '#8589a3', '#e02424'] }],
  };
}
