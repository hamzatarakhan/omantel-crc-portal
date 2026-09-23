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
    >
      @if (dirty()) { <span class="status-chip status-chip--amber">Unsaved changes</span> }
      <button type="button" class="h-9 px-3 text-xs font-semibold rounded-lg text-ink-600 hover:bg-surface-subtle disabled:opacity-40 disabled:pointer-events-none" (click)="draft.set(store.payrollRules())" [disabled]="!dirty()">Discard</button>
      <button type="button" class="inline-flex items-center gap-1.5 h-9 px-4 text-xs font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 active:scale-[0.97] transition-all disabled:opacity-40 disabled:pointer-events-none" (click)="save()" [disabled]="!dirty() || !valid()"><mat-icon class="!text-[17px] !w-[17px] !h-[17px]">save</mat-icon>Save rules</button>
    </app-page-header>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6"><!-- the two cards share one row grid (subgrid), so header, fields and summary line up whatever the text length -->
      <!-- Performance eligibility -->
      <div class="surface-card p-5 flex flex-col lg:grid lg:grid-rows-subgrid lg:row-span-3 lg:gap-y-0">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><mat-icon>workspace_premium</mat-icon></div>
          <div class="min-w-0">
            <h3 class="text-[14px] font-bold text-ink-900">Performance eligibility</h3>
            <p class="text-xs text-ink-400 mt-0.5 leading-relaxed">Only an agent whose performance score is above the threshold for their nationality can be given a performance amount. Once set, it is paid every month.</p>
          </div>
        </div>
        <div class="mt-5"><div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label class="block">
            <span [class]="lbl">Omani agents</span>
            <div [class]="group"><span [class]="affix + ' border-r'">Above</span><input type="number" min="0" max="100" step="0.5" [class]="inp" [ngModel]="draft().omaniMinScore" (ngModelChange)="set('omaniMinScore', $event)" /><span [class]="affix + ' border-l'">%</span></div>
          </label>
          <label class="block">
            <span [class]="lbl">Non-Omani agents</span>
            <div [class]="group"><span [class]="affix + ' border-r'">Above</span><input type="number" min="0" max="100" step="0.5" [class]="inp" [ngModel]="draft().nonOmaniMinScore" (ngModelChange)="set('nonOmaniMinScore', $event)" /><span [class]="affix + ' border-l'">%</span></div>
          </label>
        </div>
        @if (!validScores()) { <p class="text-xs text-status-red font-medium mt-2">Thresholds must be between 0 and 100%.</p> }
        </div>
        <div class="mt-auto pt-4 lg:mt-0 flex flex-col"><div [class]="'flex-1 ' + note">
          <mat-icon class="!text-lg !w-[18px] !h-[18px] text-brand-600 shrink-0">groups</mat-icon>
          <span><b class="text-ink-900">{{ preview().qualified }} of {{ preview().total }}</b> agents are eligible with these thresholds{{ dirty() ? ' — not saved yet' : '' }}.</span>
        </div></div>
      </div>

      <!-- Overtime rate -->
      <div class="surface-card p-5 flex flex-col lg:grid lg:grid-rows-subgrid lg:row-span-3 lg:gap-y-0">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><mat-icon>more_time</mat-icon></div>
          <div class="min-w-0">
            <h3 class="text-[14px] font-bold text-ink-900">Overtime rate</h3>
            <p class="text-xs text-ink-400 mt-0.5 leading-relaxed">How one overtime hour is priced for each agent, from their basic salary.</p>
          </div>
        </div>
        <div class="mt-5"><div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label class="block">
            <span [class]="lbl">Days per month</span>
            <div [class]="group"><input type="number" min="1" max="31" [class]="inp" [ngModel]="draft().overtimeDays" (ngModelChange)="set('overtimeDays', $event)" /><span [class]="affix + ' border-l'">days</span></div>
          </label>
          <label class="block">
            <span [class]="lbl">Hours per day</span>
            <div [class]="group"><input type="number" min="1" max="24" [class]="inp" [ngModel]="draft().overtimeHoursPerDay" (ngModelChange)="set('overtimeHoursPerDay', $event)" /><span [class]="affix + ' border-l'">hours</span></div>
          </label>
          <label class="block">
            <span [class]="lbl">Premium</span>
            <div [class]="group"><span [class]="affix + ' border-r'">&times;</span><input type="number" min="1" step="0.05" [class]="inp" [ngModel]="draft().overtimePremium" (ngModelChange)="set('overtimePremium', $event)" /></div>
          </label>
        </div>
        @if (!validOvertime()) { <p class="text-xs text-status-red font-medium mt-2">Days and hours must be at least 1, and the premium at least 1.</p> }
        </div>
        <div class="mt-auto pt-4 lg:mt-0 flex flex-col"><div [class]="'flex-1 ' + note + ' flex-wrap'">
          <span class="font-semibold text-ink-700">Basic</span> <span [class]="op">&divide;</span> {{ draft().overtimeDays }} <span [class]="op">&divide;</span> {{ draft().overtimeHoursPerDay }} <span [class]="op">&times;</span> {{ draft().overtimePremium }} <span [class]="op">&times;</span> <span class="font-semibold text-ink-700">hours</span>
          <span class="ml-auto text-ink-400">e.g. 276.722 OMR, 25.5 h &rarr; <b class="text-ink-900">{{ example() | number:'1.3-3' }} OMR</b></span>
        </div></div>
      </div>
    </div>

    <div class="surface-card overflow-hidden mb-4">
      <div class="flex items-center justify-between gap-3 flex-wrap px-4 py-3.5 border-b border-surface-border">
        <div>
          <h3 class="text-[13.5px] font-bold text-ink-900">Performance amount per agent</h3>
          <p class="text-xs text-ink-400 mt-0.5">{{ qualifiedCount() }} of {{ rows().length }} agents eligible &middot; {{ performanceTotal() | number:'1.0-3' }} OMR performance per month &middot; {{ overtimeTotal() | number:'1.3-3' }} OMR overtime this month</p>
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
              <th class="text-right">Performance score</th><th>Eligibility</th><th class="text-right">Performance (OMR / month)</th>
              <th class="text-right">Overtime hours</th><th class="text-right">Overtime (OMR)</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.a.id) {
              <tr>
                <td><a class="font-semibold text-ink-900 hover:text-brand-700" [routerLink]="['/csr/directory', r.a.id]">{{ r.a.name }}</a><div class="text-[11px] text-ink-400">{{ r.a.employeeId }} &middot; {{ r.a.queue }}</div></td>
                <td>{{ r.a.vendor }}</td>
                <td>{{ r.a.nationality }}</td>
                <td class="text-right tabular-nums">{{ r.perf.score }}% <span class="text-[11px] text-ink-400">/ &gt;{{ r.perf.threshold }}%</span></td>
                <td>@if (r.perf.eligible) { <app-status-chip label="Eligible" level="normal"></app-status-chip> } @else { <app-status-chip label="Not eligible" level="neutral"></app-status-chip> }</td>
                <td class="text-right">@if (r.perf.eligible) { <input type="number" min="0" step="10" [class]="num" [ngModel]="r.perf.rate" (change)="setRate(r.a.id, $any($event.target).value)" /> } @else { <span class="text-ink-400 tabular-nums" title="Score is not above the threshold">0</span> }</td>
                <td class="text-right tabular-nums">{{ r.ot.hours | number:'1.0-1' }}</td>
                <td class="text-right tabular-nums">{{ r.ot.amount | number:'1.3-3' }}</td>
              </tr>
            } @empty { <tr><td colspan="8" class="!text-center text-sm text-ink-400 !py-8">No agents match.</td></tr> }
          </tbody>
        </table>
      </div>
    </div>
    <p class="text-xs text-ink-400">The performance amount is set once and paid every month. Scores and overtime hours come from WFO (sample figures in the prototype). Every change is written to the audit log.</p>
  `,
})
export class PerformanceOvertimeComponent {
  store = inject(CrcStore);
  private ui = inject(UiService);
  readonly field = FIELD;
  readonly num = NUM;
  readonly lbl = 'block text-[10.5px] font-bold text-ink-400 uppercase tracking-wide mb-1.5';
  readonly group = 'flex items-stretch h-10 rounded-lg border border-surface-border bg-white overflow-hidden transition-shadow focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100';
  readonly inp = 'w-full min-w-0 px-3 text-sm font-semibold tabular-nums text-ink-900 bg-transparent focus:outline-none';
  readonly affix = 'px-3 flex items-center text-xs font-semibold text-ink-500 bg-surface-subtle border-surface-border whitespace-nowrap';
  readonly note = 'min-h-[42px] flex items-center gap-x-1.5 gap-y-1 rounded-lg bg-surface-subtle border border-surface-border px-3.5 py-2.5 text-xs text-ink-600';
  readonly op = 'text-brand-600 font-bold';
  readonly vendors = ['All', 'Infoline', 'Green Umbrella', 'OJT'];

  draft = signal<PayrollRules>(this.store.payrollRules());
  vendor = signal('All');
  q = signal('');

  dirty = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(this.store.payrollRules()));
  validScores = computed(() => { const d = this.draft(), pct = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100; return pct(d.omaniMinScore) && pct(d.nonOmaniMinScore); });
  validOvertime = computed(() => { const d = this.draft(); return d.overtimeDays >= 1 && d.overtimeHoursPerDay >= 1 && d.overtimePremium >= 1; });
  valid = computed(() => this.validScores() && this.validOvertime());
  /** How many agents would be eligible with the thresholds on screen, before they are saved. */
  preview = computed(() => {
    const d = this.draft(), agents = this.store.agents();
    const qualified = agents.filter((a) => this.store.agentPayFor(a).performanceScore > (/^oman/i.test(a.nationality ?? 'Oman') ? d.omaniMinScore : d.nonOmaniMinScore)).length;
    return { qualified, total: agents.length };
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
