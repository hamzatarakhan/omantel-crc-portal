import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ChartCardComponent } from '../../../shared/components/chart-card/chart-card.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';

@Component({
  selector: 'app-cost-forecast',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, ChartCardComponent, KpiCardComponent],
  template: `
    <app-page-header
      title="Cost & Petty Cash Forecast"
      subtitle="Project the budget impact of new hires and track petty cash against the annual allocation"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Cost & Petty Cash Forecast' }]"
    ></app-page-header>

    <div class="surface-card p-5 mb-6">
      <h3 class="text-sm font-semibold text-ink-700 mb-3">Hiring Impact Calculator</h3>
      <div class="flex flex-wrap items-end gap-4">
        <div>
          <label class="text-xs text-ink-500 block mb-1">Additional resources</label>
          <input type="number" class="w-32 border border-surface-border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-brand-400 transition-colors" [(ngModel)]="extraHeadcount" min="0" />
        </div>
        <div>
          <label class="text-xs text-ink-500 block mb-1">Avg. billing rate / month (OMR)</label>
          <input type="number" class="w-40 border border-surface-border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-brand-400 transition-colors" [(ngModel)]="avgBillingRate" min="0" />
        </div>
        <div>
          <label class="text-xs text-ink-500 block mb-1">Starting in (months from now)</label>
          <input type="number" class="w-32 border border-surface-border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-brand-400 transition-colors" [(ngModel)]="startMonth" min="0" max="5" />
        </div>
        <app-kpi-card label="Projected Additional Monthly Cost" [value]="projectedMonthlyCost() | number:'1.0-0'" unit="OMR" level="info"></app-kpi-card>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <app-chart-card title="Estimated vs. Actual Cost" subtitle="Outsourcing and projects, last 6 months" type="bar" [data]="estVsActualChart"></app-chart-card>
      <app-chart-card title="Annual Petty Cash Forecast" subtitle="Based on historical spending" type="line" [data]="pettyCashChart"></app-chart-card>
    </div>
  `,
})
export class CostForecastComponent {
  extraHeadcount = 5;
  avgBillingRate = 615;
  startMonth = 1;

  projectedMonthlyCost = computed(() => this.extraHeadcount * this.avgBillingRate);

  estVsActualChart = {
    labels: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
    datasets: [
      { label: 'Estimated', data: [108000, 109500, 111000, 112500, 114000, 115500], backgroundColor: '#0f9c8f' },
      { label: 'Actual', data: [107200, 110100, 109800, 113900, 112700, 116400], backgroundColor: '#2d13ea' },
    ],
  };

  pettyCashChart = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    datasets: [{ label: 'Forecasted Petty Cash (OMR)', data: [230, 240, 210, 260, 250, 270, 240, 280, 290, 260, 300, 310], borderColor: '#e3a008', backgroundColor: 'rgba(227,160,8,0.12)', fill: true, tension: 0.35 }],
  };
}
