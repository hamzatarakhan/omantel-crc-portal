import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { AGENT_VENDORS, SETTINGS_UI } from '../settings-ui';

/** Set once: the score thresholds for the Performance line, and each agent's fixed performance rate. */
@Component({
  selector: 'app-performance-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatIconModule, PageHeaderComponent],
  template: `
    <app-page-header
      title="Performance Settings"
      subtitle="Who earns the performance rate in a month, and each agent's fixed rate"
      [breadcrumbs]="[{ label: 'Administration', link: '/admin/access-control' }, { label: 'Payroll Settings' }, { label: 'Performance Settings' }]"
    >
      @if (dirty()) { <span class="status-chip status-chip--amber">Unsaved changes</span> }
      <button type="button" [class]="ui.discard" (click)="reset()" [disabled]="!dirty()">Discard</button>
      <button type="button" [class]="ui.save" (click)="save()" [disabled]="!dirty() || !valid()"><mat-icon class="!text-[17px] !w-[17px] !h-[17px]">save</mat-icon>Save</button>
    </app-page-header>

    <div class="surface-card p-5 mb-6 max-w-3xl">
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><mat-icon>workspace_premium</mat-icon></div>
        <div class="min-w-0">
          <h3 class="text-[14px] font-bold text-ink-900">Performance eligibility</h3>
          <p class="text-xs text-ink-400 mt-0.5 leading-relaxed">An agent is paid their performance rate only when the month's score is above the threshold for their nationality — otherwise the line is 0.</p>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
        <label class="block">
          <span [class]="ui.lbl">Omani agents</span>
          <div [class]="ui.group"><span [class]="ui.affix + ' border-r'">Above</span><input type="number" min="0" max="100" step="0.5" [class]="ui.inp" [ngModel]="omani()" (ngModelChange)="omani.set(+$event)" /><span [class]="ui.affix + ' border-l'">%</span></div>
        </label>
        <label class="block">
          <span [class]="ui.lbl">Non-Omani agents</span>
          <div [class]="ui.group"><span [class]="ui.affix + ' border-r'">Above</span><input type="number" min="0" max="100" step="0.5" [class]="ui.inp" [ngModel]="nonOmani()" (ngModelChange)="nonOmani.set(+$event)" /><span [class]="ui.affix + ' border-l'">%</span></div>
        </label>
      </div>
      @if (!valid()) { <p class="text-xs text-status-red font-medium mt-2">Thresholds must be between 0 and 100%.</p> }
      <div [class]="ui.note + ' mt-4'">
        <mat-icon class="!text-lg !w-[18px] !h-[18px] text-brand-600 shrink-0">groups</mat-icon>
        <span><b class="text-ink-900">{{ preview() }} of {{ store.agents().length }}</b> agents qualify this month with these thresholds{{ dirty() ? ' — not saved yet' : '' }}.</span>
      </div>
    </div>

    <div class="surface-card overflow-hidden mb-4">
      <div class="flex items-center justify-between gap-3 flex-wrap px-4 py-3.5 border-b border-surface-border">
        <div>
          <h3 class="text-[13.5px] font-bold text-ink-900">Performance rate per agent</h3>
          <p class="text-xs text-ink-400 mt-0.5">The fixed amount each agent earns in a month where they qualify. A change applies from the current month and is written to the audit log.</p>
        </div>
        <div class="grid grid-cols-2 gap-2.5 w-full sm:w-auto sm:min-w-[380px]">
          <select [class]="ui.field" (change)="vendor.set($any($event.target).value)">
            @for (v of vendors; track v) { <option [value]="v" [selected]="v === vendor()">{{ v === 'All' ? 'All vendors' : v }}</option> }
          </select>
          <input type="search" [class]="ui.field" placeholder="Search name or employee ID" [ngModel]="q()" (ngModelChange)="q.set($event)" />
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="crc-table w-full">
          <thead><tr class="text-left"><th>Employee</th><th>Vendor</th><th>Nationality</th><th class="text-right">Qualifies with a score above</th><th class="text-right">Performance rate (OMR)</th></tr></thead>
          <tbody>
            @for (a of rows(); track a.id) {
              <tr>
                <td><a class="font-semibold text-ink-900 hover:text-brand-700" [routerLink]="['/csr/directory', a.id]">{{ a.name }}</a><div class="text-[11px] text-ink-400">{{ a.employeeId }} &middot; {{ a.queue }}</div></td>
                <td>{{ a.vendor }}</td>
                <td>{{ a.nationality }}</td>
                <td class="text-right tabular-nums">{{ store.performanceFor(a).threshold }}%</td>
                <td class="text-right"><input type="number" min="0" step="10" [class]="ui.num" [ngModel]="store.performanceRateFor(a)" (change)="setRate(a.id, $any($event.target).value)" /></td>
              </tr>
            } @empty { <tr><td colspan="5" class="!text-center text-sm text-ink-400 !py-8">No agents match.</td></tr> }
          </tbody>
        </table>
      </div>
    </div>
    <p class="text-xs text-ink-400">Each agent's score and performance month by month are on <a class="text-brand-600 font-medium" routerLink="/csr/performance-overtime">Performance &amp; Overtime</a>.</p>
  `,
})
export class PerformanceSettingsComponent {
  store = inject(CrcStore);
  private toast = inject(UiService);
  readonly ui = SETTINGS_UI;
  readonly vendors = AGENT_VENDORS;

  omani = signal(this.store.payrollRules().omaniMinScore);
  nonOmani = signal(this.store.payrollRules().nonOmaniMinScore);
  vendor = signal('All');
  q = signal('');

  dirty = computed(() => this.omani() !== this.store.payrollRules().omaniMinScore || this.nonOmani() !== this.store.payrollRules().nonOmaniMinScore);
  valid = computed(() => [this.omani(), this.nonOmani()].every((n) => Number.isFinite(n) && n >= 0 && n <= 100));
  preview = computed(() => this.store.agents().filter((a) => this.store.agentMonthFor(a).performanceScore > (/^oman/i.test(a.nationality ?? 'Oman') ? this.omani() : this.nonOmani())).length);
  rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.store.agents().filter((a) => (this.vendor() === 'All' || a.vendor === this.vendor()) && (!q || a.name.toLowerCase().includes(q) || a.employeeId.includes(q)));
  });

  reset() {
    this.omani.set(this.store.payrollRules().omaniMinScore);
    this.nonOmani.set(this.store.payrollRules().nonOmaniMinScore);
  }

  save() {
    if (!this.valid()) return;
    this.store.savePayrollRules({ ...this.store.payrollRules(), omaniMinScore: this.omani(), nonOmaniMinScore: this.nonOmani() });
    this.toast.toast('Performance thresholds saved.');
  }

  setRate(id: string, v: string) {
    const rate = Number(v);
    if (!Number.isFinite(rate) || rate < 0) { this.toast.toast('A performance rate must be 0 or more.'); return; }
    this.store.setPerformanceRate(id, rate);
  }
}
