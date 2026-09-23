import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { CrcStore, PayrollRules } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';

const FIELD = 'w-full px-2.5 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 focus:outline-none focus:border-brand-400';
const NUM = 'w-24 h-9 px-2.5 text-sm font-semibold text-right tabular-nums rounded-lg border border-surface-border bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100';

/** Admin settings behind the Performance and Overtime payable lines: the score thresholds, the overtime formula, and each agent's performance rate. */
@Component({
  selector: 'app-performance-overtime',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatIconModule, PageHeaderComponent, StatusChipComponent],
  template: `
    <app-page-header
      title="Performance & Overtime"
      subtitle="How the Performance and Overtime lines of a vendor invoice are calculated, and each agent's performance rate"
      [breadcrumbs]="[{ label: 'Administration', link: '/admin/access-control' }, { label: 'Performance & Overtime' }]"
    ></app-page-header>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
      <div class="surface-card px-5 py-4">
        <h3 class="text-[13.5px] font-bold text-ink-900">Performance eligibility</h3>
        <p class="text-xs text-ink-400 mt-0.5">An agent earns their performance rate for the month only when their score is above the threshold for their nationality; otherwise the line is 0.</p>
        <div class="grid grid-cols-2 gap-4 mt-4">
          <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Omani agents — score above</span>
            <div class="flex items-center gap-2 mt-1"><input type="number" min="0" max="100" step="0.5" [class]="num" [ngModel]="draft().omaniMinScore" (ngModelChange)="set('omaniMinScore', $event)" /><span class="text-sm text-ink-500">%</span></div></label>
          <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Non-Omani agents — score above</span>
            <div class="flex items-center gap-2 mt-1"><input type="number" min="0" max="100" step="0.5" [class]="num" [ngModel]="draft().nonOmaniMinScore" (ngModelChange)="set('nonOmaniMinScore', $event)" /><span class="text-sm text-ink-500">%</span></div></label>
        </div>
      </div>

      <div class="surface-card px-5 py-4">
        <h3 class="text-[13.5px] font-bold text-ink-900">Overtime rate</h3>
        <p class="text-xs text-ink-400 mt-0.5">Overtime pay = basic &divide; days &divide; hours per day &times; premium &times; overtime hours.</p>
        <div class="grid grid-cols-3 gap-4 mt-4">
          <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Days per month</span>
            <input type="number" min="1" max="31" [class]="num + ' mt-1'" [ngModel]="draft().overtimeDays" (ngModelChange)="set('overtimeDays', $event)" /></label>
          <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Hours per day</span>
            <input type="number" min="1" max="24" [class]="num + ' mt-1'" [ngModel]="draft().overtimeHoursPerDay" (ngModelChange)="set('overtimeHoursPerDay', $event)" /></label>
          <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Premium</span>
            <div class="flex items-center gap-2 mt-1"><span class="text-sm text-ink-500">&times;</span><input type="number" min="1" step="0.05" [class]="num" [ngModel]="draft().overtimePremium" (ngModelChange)="set('overtimePremium', $event)" /></div></label>
        </div>
        <p class="text-[11px] text-ink-400 mt-3">Example: basic 276.722 OMR, 25.5 hours &rarr; {{ example() | number:'1.3-3' }} OMR.</p>
      </div>
    </div>

    <div class="flex items-center gap-2 mb-6">
      <button type="button" class="inline-flex items-center gap-1.5 h-9 px-4 text-xs font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:pointer-events-none" (click)="save()" [disabled]="!dirty() || !valid()">Save rules</button>
      <button type="button" class="h-9 px-3 text-xs font-semibold rounded-lg text-ink-600 hover:bg-surface-subtle disabled:opacity-40" (click)="draft.set(store.payrollRules())" [disabled]="!dirty()">Discard</button>
      @if (dirty()) { <span class="text-xs text-status-amber font-medium">Unsaved changes — the Performance and Overtime lines recalculate when you save.</span> }
      @if (!valid()) { <span class="text-xs text-status-red font-medium">Thresholds must be 0–100%, days and hours at least 1, and the premium at least 1.</span> }
    </div>

    <div class="surface-card overflow-hidden mb-4">
      <div class="flex items-center justify-between gap-3 flex-wrap px-4 py-3.5 border-b border-surface-border">
        <div>
          <h3 class="text-[13.5px] font-bold text-ink-900">Performance rate per agent</h3>
          <p class="text-xs text-ink-400 mt-0.5">{{ qualifiedCount() }} of {{ rows().length }} agents qualify this month &middot; {{ performanceTotal() | number:'1.0-3' }} OMR performance &middot; {{ overtimeTotal() | number:'1.3-3' }} OMR overtime</p>
        </div>
        <div class="grid grid-cols-2 gap-2.5 w-full sm:w-auto sm:min-w-[380px]">
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
              <th class="text-right">Performance rate (OMR)</th><th class="text-right">Score this month</th><th>Performance</th>
              <th class="text-right">Overtime hours</th><th class="text-right">Overtime (OMR)</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.a.id) {
              <tr>
                <td><a class="font-semibold text-ink-900 hover:text-brand-700" [routerLink]="['/csr/directory', r.a.id]">{{ r.a.name }}</a><div class="text-[11px] text-ink-400">{{ r.a.employeeId }} &middot; {{ r.a.queue }}</div></td>
                <td>{{ r.a.vendor }}</td>
                <td>{{ r.a.nationality }}</td>
                <td class="text-right"><input type="number" min="0" step="10" [class]="num" [ngModel]="r.perf.rate" (change)="setRate(r.a.id, $any($event.target).value)" /></td>
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
    <p class="text-xs text-ink-400">Scores and overtime hours come from WFO each month (sample figures in the prototype). A rate change applies from this month's calculation and is written to the audit log.</p>
  `,
})
export class PerformanceOvertimeComponent {
  store = inject(CrcStore);
  private ui = inject(UiService);
  readonly field = FIELD;
  readonly num = NUM;
  readonly vendors = ['All', 'Infoline', 'Green Umbrella', 'OJT'];

  draft = signal<PayrollRules>(this.store.payrollRules());
  vendor = signal('All');
  q = signal('');

  dirty = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(this.store.payrollRules()));
  valid = computed(() => {
    const d = this.draft();
    const pct = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100;
    return pct(d.omaniMinScore) && pct(d.nonOmaniMinScore) && d.overtimeDays >= 1 && d.overtimeHoursPerDay >= 1 && d.overtimePremium >= 1;
  });
  example = computed(() => { const d = this.draft(); return (276.722 / d.overtimeDays / d.overtimeHoursPerDay) * d.overtimePremium * 25.5; });

  rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.store.agents()
      .filter((a) => (this.vendor() === 'All' || a.vendor === this.vendor()) && (!q || a.name.toLowerCase().includes(q) || a.employeeId.includes(q)))
      .map((a) => ({ a, perf: this.store.performanceFor(a), ot: this.store.overtimeFor(a) }));
  });
  qualifiedCount = computed(() => this.rows().filter((r) => r.perf.eligible).length);
  performanceTotal = computed(() => this.rows().reduce((s, r) => s + r.perf.amount, 0));
  overtimeTotal = computed(() => this.rows().reduce((s, r) => s + r.ot.amount, 0));

  set(key: keyof PayrollRules, v: any) {
    this.draft.update((d) => ({ ...d, [key]: Number(v) }));
  }

  save() {
    if (!this.valid()) return;
    this.store.savePayrollRules(this.draft());
    this.ui.toast('Rules saved — Performance and Overtime recalculated.');
  }

  setRate(id: string, v: string) {
    const rate = Number(v);
    if (!Number.isFinite(rate) || rate < 0) { this.ui.toast('A performance rate must be 0 or more.'); return; }
    this.store.setPerformanceRate(id, rate);
  }
}
