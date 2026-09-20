import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ChartCardComponent } from '../../../shared/components/chart-card/chart-card.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { percentUsedToLevel } from '../../../core/models/status';
import { RequiresDirective } from '../../../shared/directives/requires.directive';

const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
const INPUT = 'w-full px-3 py-2.5 pr-16 text-sm rounded-lg border border-surface-border bg-white focus:outline-none focus:border-brand-400 transition-colors';

@Component({
  selector: 'app-cost-forecast',
  standalone: true,
  imports: [RequiresDirective, CommonModule, FormsModule, MatButtonModule, MatIconModule, PageHeaderComponent, ChartCardComponent, KpiCardComponent],
  template: `
    <app-page-header
      title="Cost & Petty Cash Forecast"
      subtitle="Project the budget impact of new hires and track petty cash against the annual allocation"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Cost & Petty Cash Forecast' }]"
    ></app-page-header>

    <!-- Hiring scenario: assumptions on the left, results on the right -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6 items-start">
      <div class="surface-card px-4 pt-3.5 pb-4 sm:px-5 flex flex-col gap-4">
        <div>
          <h3 class="text-[13.5px] font-bold text-ink-900">Hiring scenario</h3>
          <p class="text-xs text-ink-400 mt-0.5">Change an assumption and the results update instantly.</p>
        </div>

        <div>
          <label class="text-[13px] font-medium text-ink-700 block mb-1.5">Additional resources</label>
          <div class="relative">
            <input type="number" min="0" [class]="input" [ngModel]="extraHeadcount()" (ngModelChange)="extraHeadcount.set(+$event || 0)" />
            <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400 pointer-events-none">people</span>
          </div>
        </div>
        <div>
          <label class="text-[13px] font-medium text-ink-700 block mb-1.5">Average billing rate</label>
          <div class="relative">
            <input type="number" min="0" [class]="input" [ngModel]="avgBillingRate()" (ngModelChange)="avgBillingRate.set(+$event || 0)" />
            <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400 pointer-events-none">OMR / mo</span>
          </div>
        </div>
        <div>
          <label class="text-[13px] font-medium text-ink-700 block mb-1.5">Starting in</label>
          <div class="relative">
            <input type="number" min="0" max="11" [class]="input" [ngModel]="startMonth()" (ngModelChange)="startMonth.set(+$event || 0)" />
            <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400 pointer-events-none">months</span>
          </div>
          <p class="text-[11px] text-ink-400 mt-1">Months from now (0–11).</p>
        </div>

        <button mat-flat-button color="primary" class="w-full" (click)="applyToDraft()" appRequires="Prepare/Edit Draft Budget">
          <mat-icon class="!text-base !mr-1">playlist_add</mat-icon>Add to next-year budget draft
        </button>
      </div>

      <div class="lg:col-span-2 flex flex-col gap-4">
        <div class="grid grid-cols-2 2xl:grid-cols-4 gap-4">
          <app-kpi-card label="Extra monthly cost" [value]="monthlyCost() | number:'1.0-0'" unit="OMR" level="info" icon="payments"></app-kpi-card>
          <app-kpi-card label="Next 12 months" [value]="yearCost() | number:'1.0-0'" unit="OMR" icon="calendar_month"></app-kpi-card>
          <app-kpi-card label="Budget remaining" [value]="store.budgetTotals().remaining | number:'1.0-0'" unit="OMR" level="normal" icon="account_balance_wallet"></app-kpi-card>
          <app-kpi-card label="Share of remaining" [value]="sharePct().toFixed(0)" unit="%" [level]="shareLevel()" icon="donut_small"></app-kpi-card>
        </div>
        <app-chart-card title="Estimated vs. Actual Cost" subtitle="Outsourcing and projects — the orange series adds the hiring scenario" type="bar" [data]="estVsActualChart()"></app-chart-card>
      </div>
    </div>

    <!-- Petty cash: same pattern -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
      <div class="surface-card px-4 pt-3.5 pb-4 sm:px-5 flex flex-col gap-4">
        <div>
          <h3 class="text-[13.5px] font-bold text-ink-900">Petty cash scenario</h3>
          <p class="text-xs text-ink-400 mt-0.5">Compounds this year's base spending month by month.</p>
        </div>
        <div>
          <label class="text-[13px] font-medium text-ink-700 block mb-1.5">Expected monthly growth</label>
          <div class="relative">
            <input type="number" [class]="input" [ngModel]="growth()" (ngModelChange)="growth.set(+$event || 0)" />
            <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400 pointer-events-none">% / mo</span>
          </div>
        </div>
        @if (pettyPct() > 100) {
          <div class="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-status-red font-semibold">
            At this growth rate petty cash exceeds its allocation by {{ pettyYear() - pettyAllocation() | number:'1.0-0' }} OMR.
          </div>
        } @else {
          <div class="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-status-normal font-semibold">
            Within the allocation — {{ pettyAllocation() - pettyYear() | number:'1.0-0' }} OMR to spare.
          </div>
        }
      </div>

      <div class="lg:col-span-2 flex flex-col gap-4">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <app-kpi-card label="Forecast for the year" [value]="pettyYear() | number:'1.0-0'" unit="OMR" icon="savings"></app-kpi-card>
          <app-kpi-card label="Annual allocation" [value]="pettyAllocation() | number:'1.0-0'" unit="OMR" icon="account_balance"></app-kpi-card>
          <app-kpi-card label="Forecast vs allocation" [value]="pettyPct().toFixed(0)" unit="%" [level]="pettyLevel()" icon="trending_up"></app-kpi-card>
        </div>
        <app-chart-card title="Annual Petty Cash Forecast" subtitle="Base spending compounded by the growth rate" type="line" [data]="pettyCashChart()"></app-chart-card>
      </div>
    </div>
  `,
})
export class CostForecastComponent {
  store = inject(CrcStore);
  private ui = inject(UiService);
  input = INPUT;

  extraHeadcount = signal(5);
  avgBillingRate = signal(615);
  startMonth = signal(1);
  growth = signal(2);

  monthlyCost = computed(() => this.extraHeadcount() * this.avgBillingRate());
  yearCost = computed(() => this.monthlyCost() * Math.max(0, 12 - this.startMonth()));
  sharePct = computed(() => {
    const rem = this.store.budgetTotals().remaining;
    return rem > 0 ? (this.yearCost() / rem) * 100 : 100;
  });
  shareLevel = computed(() => percentUsedToLevel(this.sharePct()));

  private pettyBase = [190, 200, 175, 215, 205, 220, 200, 230, 240, 215, 245, 255];
  pettySeries = computed(() => this.pettyBase.map((v, i) => Math.round(v * Math.pow(1 + this.growth() / 100, i))));
  pettyYear = computed(() => this.pettySeries().reduce((s, v) => s + v, 0));
  pettyAllocation = computed(() => this.store.budgetLines().filter((l) => l.category === 'Petty Cash').reduce((s, l) => s + l.allocated, 0));
  pettyPct = computed(() => (this.pettyAllocation() ? (this.pettyYear() / this.pettyAllocation()) * 100 : 0));
  pettyLevel = computed(() => percentUsedToLevel(this.pettyPct()));

  estVsActualChart = computed(() => {
    const est = [108000, 109500, 111000, 112500, 114000, 115500];
    const scenario = est.map((v, i) => v + (i >= this.startMonth() ? this.monthlyCost() : 0));
    return {
      labels: MONTHS,
      datasets: [
        { label: 'Estimated', data: est, backgroundColor: '#0f9c8f' },
        { label: 'Actual', data: [107200, 110100, 109800, 113900, 112700, 116400], backgroundColor: '#2d13ea' },
        { label: 'Estimated + new hires', data: scenario, backgroundColor: 'rgba(234,110,0,0.35)', borderColor: '#ea6e00', borderWidth: 1 },
      ],
    };
  });

  pettyCashChart = computed(() => ({
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    datasets: [
      { label: 'Base spending (OMR)', data: this.pettyBase, borderColor: '#8589a3', backgroundColor: 'transparent', tension: 0.35, borderDash: [5, 4] },
      { label: 'Forecast with growth (OMR)', data: this.pettySeries(), borderColor: '#e3a008', backgroundColor: 'rgba(227,160,8,0.12)', fill: true, tension: 0.35 },
    ],
  }));

  async applyToDraft() {
    if (!this.ui.requires('Prepare/Edit Draft Budget')) return;
    if (this.store.budgetPlan().status !== 'Draft') {
      this.ui.toast('The next-year budget is already submitted. Start a new draft on the Budget Preparation screen first.');
      return;
    }
    const target = this.store.budgetLines().find((l) => l.poLayer === 'PO1');
    if (!target) return;
    const ok = await this.ui.confirm({ title: 'Add hiring cost to the budget draft?', message: `${Math.round(this.yearCost()).toLocaleString()} OMR will be added to "${target.item}" in the next-year draft.`, confirmLabel: 'Add to draft', icon: 'playlist_add' });
    if (!ok) return;
    const current = this.store.budgetPlan().drafts[target.id] ?? Math.round(target.allocated * 1.03);
    this.store.setDraft(target.id, current + Math.round(this.yearCost()));
    this.store.log('Budget Draft Adjusted', target.id, `+${Math.round(this.yearCost()).toLocaleString()} OMR for ${this.extraHeadcount()} additional resource(s) from the forecast calculator.`);
    this.ui.toast('Added to the next-year budget draft.');
  }
}
