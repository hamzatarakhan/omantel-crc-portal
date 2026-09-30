import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { SETTINGS_UI } from '../settings-ui';

/** Set once: the score thresholds for the Performance line. */
@Component({
  selector: 'app-performance-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatIconModule, PageHeaderComponent],
  template: `
    <app-page-header
      title="Performance Settings"
      subtitle="Who earns the performance rate in a month, and each agent's fixed rate"
      [breadcrumbs]="[{ label: 'CSR Management', link: '/csr/directory' }, { label: 'Payroll Settings' }, { label: 'Performance Settings' }]"
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

    <p class="text-xs text-ink-400">Each agent's own performance rate is on <a class="text-brand-600 font-medium" routerLink="/csr/performance-rates">Performance Rates</a>; their score and performance month by month are on <a class="text-brand-600 font-medium" routerLink="/csr/performance-overtime">Performance, Overtime &amp; Incentive</a>.</p>
  `,
})
export class PerformanceSettingsComponent {
  store = inject(CrcStore);
  private toast = inject(UiService);
  readonly ui = SETTINGS_UI;

  omani = signal(this.store.payrollRules().omaniMinScore);
  nonOmani = signal(this.store.payrollRules().nonOmaniMinScore);

  dirty = computed(() => this.omani() !== this.store.payrollRules().omaniMinScore || this.nonOmani() !== this.store.payrollRules().nonOmaniMinScore);
  valid = computed(() => [this.omani(), this.nonOmani()].every((n) => Number.isFinite(n) && n >= 0 && n <= 100));
  preview = computed(() => this.store.agents().filter((a) => this.store.agentMonthFor(a).performanceScore > (/^oman/i.test(a.nationality ?? 'Oman') ? this.omani() : this.nonOmani())).length);

  reset() {
    this.omani.set(this.store.payrollRules().omaniMinScore);
    this.nonOmani.set(this.store.payrollRules().nonOmaniMinScore);
  }

  save() {
    if (!this.valid()) return;
    this.store.savePayrollRules({ ...this.store.payrollRules(), omaniMinScore: this.omani(), nonOmaniMinScore: this.nonOmani() });
    this.toast.toast('Performance thresholds saved.');
  }
}
