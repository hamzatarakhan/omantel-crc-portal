import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { ChartCardComponent } from '../../../shared/components/chart-card/chart-card.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { ProjectRequests } from '../../../core/services/project-requests.service';
import { percentUsedToLevel } from '../../../core/models/status';

@Component({
  selector: 'app-budget-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, PageHeaderComponent, KpiCardComponent, ChartCardComponent],
  template: `
    <app-page-header
      title="Budget Dashboard"
      subtitle="Customer Care budget across Total, Petty Cash, Projects, Outsourcing, and OJT"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Budget Dashboard' }]"
    ></app-page-header>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
      <app-kpi-card label="Total Budget" [value]="totals().allocated | number:'1.0-0'" unit="OMR"></app-kpi-card>
      <app-kpi-card label="Total Spent" [value]="totals().spent | number:'1.0-0'" unit="OMR" [level]="level()"></app-kpi-card>
      <app-kpi-card label="% Used" [value]="totals().pct.toFixed(0)" unit="%" [level]="level()"></app-kpi-card>
      <app-kpi-card label="Remaining" [value]="totals().remaining | number:'1.0-0'" unit="OMR" level="normal"></app-kpi-card>
    </div>

    <a routerLink="/contracts-budget/budget-preparation" class="surface-card flex items-center gap-3 px-4 py-3 mb-6 hover:border-brand-300 transition-colors">
      <mat-icon class="!text-brand-600">edit_note</mat-icon>
      <div class="flex-1 text-sm text-ink-700">
        Next-year budget: <span class="font-semibold text-ink-900">{{ store.nextYearTotal() | number:'1.0-0' }} OMR</span>
        <span class="text-ink-400"> &middot; +{{ growth() }}% vs current</span>
      </div>
      <span class="status-chip" [class]="planChip()">{{ store.budgetPlan().status }}</span>
      <mat-icon class="!text-ink-400">chevron_right</mat-icon>
    </a>

    <a routerLink="/contracts-budget/projects" class="surface-card flex items-center gap-3 px-4 py-3 mb-6 hover:border-brand-300 transition-colors">
      <mat-icon class="!text-brand-600">rocket_launch</mat-icon>
      <div class="flex-1 text-sm text-ink-700">
        Project requests: <span class="font-semibold text-ink-900">{{ projects.kept().length }} kept</span> ({{ projects.keptBudget() | number:'1.0-0' }} OMR added to next year)
        <span class="text-ink-400"> &middot; {{ projects.waiting().length }} waiting for a decision</span>
      </div>
      <mat-icon class="!text-ink-400">chevron_right</mat-icon>
    </a>

    @if (alerts().length) {
      <div class="surface-card px-4 py-3 mb-6 flex flex-col gap-1.5">
        @for (a of alerts(); track a.category) {
          <div class="flex items-center gap-2 text-[13px]">
            <span class="status-chip" [class]="a.pct >= 100 ? 'status-chip--red' : 'status-chip--orange'">{{ a.pct }}%</span>
            <span class="text-ink-700"><strong>{{ a.category }}</strong> has used {{ a.pct }}% of its allocation — {{ a.remaining | number:'1.0-0' }} OMR left.</span>
          </div>
        }
      </div>
    }

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <app-chart-card title="Budget Approval Summary" subtitle="Allocated vs. spent by category" type="bar" [data]="categoryChart()"></app-chart-card>
      <app-chart-card title="OJT Budget Trend" subtitle="Monthly spend trend" type="line" [data]="ojtTrendChart"></app-chart-card>
    </div>
  `,
})
export class BudgetDashboardComponent {
  store = inject(CrcStore);
  projects = inject(ProjectRequests);

  totals = this.store.budgetTotals;
  level = computed(() => percentUsedToLevel(this.totals().pct));
  growth = computed(() => {
    const t = this.totals().allocated;
    return t ? (((this.store.nextYearTotal() - t) / t) * 100).toFixed(1) : '0';
  });
  planChip = computed(() => ({ Draft: 'status-chip--neutral', Submitted: 'status-chip--amber', Approved: 'status-chip--normal', Rejected: 'status-chip--red' })[this.store.budgetPlan().status]);
  alerts = computed(() =>
    this.store.budgetByCategory()
      .map((c) => ({ category: c.category, pct: Math.round((c.spent / c.allocated) * 100), remaining: c.allocated - c.spent }))
      .filter((c) => c.pct >= 90),
  );

  categoryChart = computed(() => ({
    labels: ['Total Budget', ...this.store.budgetByCategory().map((c) => c.category)],
    datasets: [
      { label: 'Allocated', data: [this.totals().allocated, ...this.store.budgetByCategory().map((c) => c.allocated)], backgroundColor: '#0f9c8f' },
      { label: 'Spent', data: [this.totals().spent, ...this.store.budgetByCategory().map((c) => c.spent)], backgroundColor: '#2d13ea' },
    ],
  }));

  ojtTrendChart = {
    labels: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
    datasets: [{ label: 'OJT Spend (OMR)', data: [800, 950, 1100, 1050, 1250, 1050], borderColor: '#0e9f6e', backgroundColor: 'rgba(14,159,110,0.12)', fill: true, tension: 0.35 }],
  };
}
