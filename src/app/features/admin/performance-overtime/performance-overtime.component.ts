import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { CrcStore } from '../../../core/services/crc-store.service';

const FIELD = 'w-full px-2.5 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 focus:outline-none focus:border-brand-400';

/** Each agent's score, performance and overtime month by month (read-only; the rules live on the two settings pages). */
@Component({
  selector: 'app-performance-overtime',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatIconModule, PageHeaderComponent, StatusChipComponent],
  template: `
    <app-page-header
      title="Performance & Overtime"
      subtitle="Each agent's score, performance and overtime, month by month"
      [breadcrumbs]="[{ label: 'CSR Management', link: '/csr/directory' }, { label: 'Performance & Overtime' }]"
    ></app-page-header>

    <div class="surface-card overflow-hidden mb-4">
      <div class="flex items-center justify-between gap-3 flex-wrap px-4 py-3.5 border-b border-surface-border">
        <div>
          <h3 class="text-[13.5px] font-bold text-ink-900">Performance rate per agent</h3>
          <p class="text-xs text-ink-400 mt-0.5">{{ qualifiedCount() }} of {{ rows().length }} agents qualify in {{ monthLabel(month()) }} &middot; {{ performanceTotal() | number:'1.0-3' }} OMR performance &middot; {{ overtimeTotal() | number:'1.3-3' }} OMR overtime</p>
        </div>
        <div class="grid grid-cols-3 gap-2.5 w-full sm:w-auto sm:min-w-[560px]">
          <select [class]="field" (change)="month.set($any($event.target).value)">
            @for (m of months; track m) { <option [value]="m" [selected]="m === month()">{{ monthLabel(m) }}</option> }
          </select>
          <select [class]="field" (change)="vendor.set($any($event.target).value)">
            @for (v of vendors; track v) { <option [value]="v" [selected]="v === vendor()">{{ v === 'All' ? 'All vendors' : v }}</option> }
          </select>
          <input type="search" [class]="field" placeholder="Search name or employee ID" [ngModel]="q()" (ngModelChange)="q.set($event)" />
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="crc-table w-full">
          <thead>
            <tr class="text-left">
              <th>Employee</th><th>Vendor</th><th>Nationality</th>
              <th class="text-right">Performance rate (OMR)</th><th class="text-right">Score</th><th>Performance</th>
              <th class="text-right">Overtime hours</th><th class="text-right">Overtime (OMR)</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.a.id) {
              <tr>
                <td><a class="font-semibold text-ink-900 hover:text-brand-700" [routerLink]="['/csr/directory', r.a.id]">{{ r.a.name }}</a><div class="text-[11px] text-ink-400">{{ r.a.employeeId }} &middot; {{ r.a.queue }}</div></td>
                <td>{{ r.a.vendor }}</td>
                <td>{{ r.a.nationality }}</td>
                <td class="text-right tabular-nums">{{ r.perf.rate | number:'1.0-3' }}</td>
                <td class="text-right tabular-nums">{{ r.perf.score }}% <span class="text-[11px] text-ink-400">/ &gt;{{ r.perf.threshold }}%</span></td>
                <td>@if (r.perf.eligible) { <app-status-chip [label]="(r.perf.amount | number:'1.0-3') + ' OMR'" level="normal"></app-status-chip> } @else { <app-status-chip label="Below threshold" level="neutral"></app-status-chip> }</td>
                <td class="text-right tabular-nums">{{ r.ot.hours | number:'1.0-1' }}</td>
                <td class="text-right tabular-nums">{{ r.ot.amount | number:'1.3-3' }}</td>
              </tr>
            } @empty { <tr><td colspan="8" class="!text-center text-sm text-ink-400 !py-8">No agents match.</td></tr> }
          </tbody>
        </table>
      </div>
    </div>
    <p class="text-xs text-ink-400">Scores and overtime hours come from WFO each month (sample figures in the prototype). Thresholds and rates are set on <a class="text-brand-600 font-medium" routerLink="/csr/performance-settings">Performance Settings</a> and <a class="text-brand-600 font-medium" routerLink="/csr/overtime-settings">Overtime Settings</a>.</p>
  `,
})
export class PerformanceOvertimeComponent {
  store = inject(CrcStore);
  readonly field = FIELD;
  readonly vendors = ['All', 'Infoline', 'Green Umbrella', 'OJT'];

  vendor = signal('All');
  q = signal('');
  readonly months = [...this.store.payrollMonths()].reverse();
  month = signal(this.months[0]);

  rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.store.agents()
      .filter((a) => (this.vendor() === 'All' || a.vendor === this.vendor()) && (!q || a.name.toLowerCase().includes(q) || a.employeeId.includes(q)))
      .map((a) => ({ a, perf: this.store.performanceFor(a, this.month()), ot: this.store.overtimeFor(a, this.month()) }));
  });
  qualifiedCount = computed(() => this.rows().filter((r) => r.perf.eligible).length);
  performanceTotal = computed(() => this.rows().reduce((s, r) => s + r.perf.amount, 0));
  overtimeTotal = computed(() => this.rows().reduce((s, r) => s + r.ot.amount, 0));

  monthLabel(m: string) {
    const [y, mo] = m.split('-').map(Number);
    return new Date(y, mo - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  }
}
