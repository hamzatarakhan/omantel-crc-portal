import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { ChartCardComponent } from '../../../shared/components/chart-card/chart-card.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';

const VENDORS = ['All', 'Infoline', 'Green Umbrella', 'OJT'];
const PERIODS = [3, 6];

@Component({
  selector: 'app-workforce-analytics',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule, PageHeaderComponent, KpiCardComponent, ChartCardComponent],
  template: `
    <app-page-header
      title="Workforce Analytics"
      subtitle="Headcount, resignation, recruitment, and overtime trends pulled from the Workforce (WFO) system"
      [breadcrumbs]="[{ label: 'CSR Management', link: '/csr/directory' }, { label: 'Workforce Analytics' }]"
    >
      <button mat-stroked-button (click)="exportCsv()"><mat-icon class="!text-base !mr-1">download</mat-icon>Export data</button>
    </app-page-header>

    <div class="flex items-center gap-3 flex-wrap mb-4">
      <div class="flex items-center gap-1 bg-white border border-surface-border rounded-lg p-0.5">
        @for (v of vendors; track v) {
          <button (click)="vendor.set(v)" class="px-2.5 py-1 text-xs font-semibold rounded-md transition-colors" [class]="vendor() === v ? 'bg-brand-50 text-brand-700' : 'text-ink-500 hover:text-ink-900'">{{ v }}</button>
        }
      </div>
      <div class="flex items-center gap-1 bg-white border border-surface-border rounded-lg p-0.5">
        @for (p of periods; track p) {
          <button (click)="period.set(p)" class="px-2.5 py-1 text-xs font-semibold rounded-md transition-colors" [class]="period() === p ? 'bg-brand-50 text-brand-700' : 'text-ink-500 hover:text-ink-900'">Last {{ p }} months</button>
        }
      </div>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <app-kpi-card label="Total Workforce" [value]="totalWorkforce()" icon="groups"></app-kpi-card>
      <app-kpi-card label="Resignation Rate (mo.)" [value]="resignationRate() + '%'" level="amber" icon="logout"></app-kpi-card>
      <a routerLink="/csr/recruitment" class="contents"><app-kpi-card label="Open Requisitions" [value]="openReqs()" level="info" icon="assignment"></app-kpi-card></a>
      <app-kpi-card label="Avg. RFT (days)" [value]="14" icon="timer"></app-kpi-card>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      <app-chart-card title="Workforce Summary" subtitle="Infoline | Green Umbrella | OJT" type="bar" [data]="workforceChart()"></app-chart-card>
      <app-chart-card title="Resignations Over Time" type="line" [data]="resignationChart()"></app-chart-card>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <app-chart-card title="Overtime by Queue" type="bar" [data]="overtimeChart"></app-chart-card>
      <app-chart-card title="Attendance Today" [subtitle]="vendor() === 'All' ? 'All vendors' : vendor()" type="pie" [data]="attendanceChart()"></app-chart-card>
    </div>
  `,
})
export class WorkforceAnalyticsComponent {
  private store = inject(CrcStore);
  private ui = inject(UiService);

  vendors = VENDORS;
  periods = PERIODS;
  vendor = signal('All');
  period = signal(6);

  private snaps = computed(() => this.store.snapshots.slice(-this.period()));
  private scoped = computed(() => this.store.agents().filter((a) => this.vendor() === 'All' || a.vendor === this.vendor()));

  totalWorkforce = computed(() => this.scoped().length);
  resignationRate = computed(() => {
    const last = this.store.snapshots[this.store.snapshots.length - 1];
    return ((last.resignations / Math.max(1, this.store.agents().length)) * 100).toFixed(1);
  });
  openReqs = computed(() => this.store.candidates().filter((c) => c.status === 'New' || c.status === 'Interview Scheduled').length);

  workforceChart = computed(() => {
    const cur = { Infoline: 0, 'Green Umbrella': 0, OJT: 0 } as Record<string, number>;
    for (const a of this.store.agents()) cur[a.vendor]++;
    const snaps = this.snaps();
    const series = (key: 'infoline' | 'greenUmbrella' | 'ojt', label: string, color: string) => ({ label, data: snaps.map((s, i) => (i === snaps.length - 1 ? cur[label] : s[key])), backgroundColor: color });
    return {
      labels: snaps.map((s) => s.month),
      datasets: [series('infoline', 'Infoline', '#2d13ea'), series('greenUmbrella', 'Green Umbrella', '#ea6e00'), series('ojt', 'OJT', '#0f9c8f')].filter((d) => this.vendor() === 'All' || d.label === this.vendor()),
    };
  });

  resignationChart = computed(() => ({
    labels: this.snaps().map((s) => s.month),
    datasets: [{ label: 'Resignations', data: this.snaps().map((s) => s.resignations), borderColor: '#e02424', backgroundColor: 'rgba(224,36,36,0.12)', fill: true, tension: 0.35 }],
  }));

  overtimeChart = {
    labels: ['Sales', 'Retention', 'Complaints', 'Debt Recovery', 'Billing Complaints'],
    datasets: [{ label: 'Overtime Hours', data: [120, 95, 60, 40, 55], backgroundColor: '#e3a008' }],
  };

  attendanceChart = computed(() => {
    const c: Record<string, number> = { Present: 0, 'On Leave': 0, Off: 0, Absent: 0 };
    for (const a of this.scoped()) c[a.status]++;
    return { labels: Object.keys(c), datasets: [{ data: Object.values(c), backgroundColor: ['#0e9f6e', '#e3a008', '#8589a3', '#e02424'] }] };
  });

  exportCsv() {
    this.ui.csv('workforce-analytics', this.snaps().map((s) => ({ Month: s.month, Infoline: s.infoline, 'Green Umbrella': s.greenUmbrella, OJT: s.ojt, Resignations: s.resignations })));
  }
}
