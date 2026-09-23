import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { AGENT_VENDORS, SETTINGS_UI } from '../settings-ui';

/** Set once: how an overtime hour is priced — basic ÷ days ÷ hours per day × premium. */
@Component({
  selector: 'app-overtime-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatIconModule, PageHeaderComponent],
  template: `
    <app-page-header
      title="Overtime Settings"
      subtitle="How one overtime hour is priced for each agent"
      [breadcrumbs]="[{ label: 'CSR Management', link: '/csr/directory' }, { label: 'Payroll Settings' }, { label: 'Overtime Settings' }]"
    >
      @if (dirty()) { <span class="status-chip status-chip--amber">Unsaved changes</span> }
      <button type="button" [class]="ui.discard" (click)="reset()" [disabled]="!dirty()">Discard</button>
      <button type="button" [class]="ui.save" (click)="save()" [disabled]="!dirty() || !valid()"><mat-icon class="!text-[17px] !w-[17px] !h-[17px]">save</mat-icon>Save</button>
    </app-page-header>

    <div class="surface-card p-5 mb-6 max-w-3xl">
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><mat-icon>more_time</mat-icon></div>
        <div class="min-w-0">
          <h3 class="text-[14px] font-bold text-ink-900">Default overtime rate</h3>
          <p class="text-xs text-ink-400 mt-0.5 leading-relaxed">The formula for every agent who has no rate of their own, worked out from their basic salary.</p>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
        <label class="block">
          <span [class]="ui.lbl">Days per month</span>
          <div [class]="ui.group"><input type="number" min="1" max="31" [class]="ui.inp" [ngModel]="days()" (ngModelChange)="days.set(+$event)" /><span [class]="ui.affix + ' border-l'">days</span></div>
        </label>
        <label class="block">
          <span [class]="ui.lbl">Hours per day</span>
          <div [class]="ui.group"><input type="number" min="1" max="24" [class]="ui.inp" [ngModel]="hours()" (ngModelChange)="hours.set(+$event)" /><span [class]="ui.affix + ' border-l'">hours</span></div>
        </label>
        <label class="block">
          <span [class]="ui.lbl">Premium</span>
          <div [class]="ui.group"><span [class]="ui.affix + ' border-r'">&times;</span><input type="number" min="1" step="0.05" [class]="ui.inp" [ngModel]="premium()" (ngModelChange)="premium.set(+$event)" /></div>
        </label>
      </div>
      @if (!valid()) { <p class="text-xs text-status-red font-medium mt-2">Days and hours must be at least 1, and the premium at least 1.</p> }
      <div [class]="ui.note + ' mt-4 flex-wrap'">
        <span class="font-semibold text-ink-700">Basic</span> <span [class]="ui.op">&divide;</span> {{ days() }} <span [class]="ui.op">&divide;</span> {{ hours() }} <span [class]="ui.op">&times;</span> {{ premium() }} <span [class]="ui.op">&times;</span> <span class="font-semibold text-ink-700">hours</span>
        <span class="ml-auto text-ink-400">e.g. 276.722 OMR, 25.5 h &rarr; <b class="text-ink-900">{{ rateFor(276.722) * 25.5 | number:'1.3-3' }} OMR</b></span>
      </div>
    </div>

    <div class="surface-card overflow-hidden mb-4">
      <div class="flex items-center justify-between gap-3 flex-wrap px-4 py-3.5 border-b border-surface-border">
        <div>
          <h3 class="text-[13.5px] font-bold text-ink-900">Overtime rate per agent</h3>
          <p class="text-xs text-ink-400 mt-0.5">Type a rate to give an agent their own; clear it to go back to the default{{ dirty() ? ' (default shown with the unsaved values)' : '' }}. Changes are written to the audit log.</p>
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
          <thead><tr class="text-left"><th>Employee</th><th>Vendor</th><th>Degree</th><th class="text-right">Basic salary (OMR)</th><th class="text-right">Default rate</th><th class="text-right">Overtime rate (OMR / hour)</th></tr></thead>
          <tbody>
            @for (r of rows(); track r.a.id) {
              <tr>
                <td><a class="font-semibold text-ink-900 hover:text-brand-700" [routerLink]="['/csr/directory', r.a.id]">{{ r.a.name }}</a><div class="text-[11px] text-ink-400">{{ r.a.employeeId }} &middot; {{ r.a.queue }}</div></td>
                <td>{{ r.a.vendor }}</td>
                <td>{{ r.a.degree }}</td>
                <td class="text-right tabular-nums">{{ r.basic | number:'1.3-3' }}</td>
                <td class="text-right tabular-nums text-ink-400">{{ rateFor(r.basic) | number:'1.3-3' }}</td>
                <td class="text-right whitespace-nowrap">
                  @if (r.custom !== undefined) { <span class="status-chip status-chip--info mr-1.5">Own rate</span> }
                  <input type="number" min="0" step="0.001" [class]="ui.num" [placeholder]="(rateFor(r.basic) | number:'1.3-3') ?? ''" [ngModel]="r.custom ?? null" (change)="setRate(r.a.id, $any($event.target).value)" />
                </td>
              </tr>
            } @empty { <tr><td colspan="6" class="!text-center text-sm text-ink-400 !py-8">No agents match.</td></tr> }
          </tbody>
        </table>
      </div>
    </div>
    <p class="text-xs text-ink-400">Each agent's overtime hours and pay month by month are on <a class="text-brand-600 font-medium" routerLink="/csr/performance-overtime">Performance &amp; Overtime</a>.</p>
  `,
})
export class OvertimeSettingsComponent {
  store = inject(CrcStore);
  private toast = inject(UiService);
  readonly ui = SETTINGS_UI;
  readonly vendors = AGENT_VENDORS;

  days = signal(this.store.payrollRules().overtimeDays);
  hours = signal(this.store.payrollRules().overtimeHoursPerDay);
  premium = signal(this.store.payrollRules().overtimePremium);
  vendor = signal('All');
  q = signal('');

  dirty = computed(() => { const r = this.store.payrollRules(); return this.days() !== r.overtimeDays || this.hours() !== r.overtimeHoursPerDay || this.premium() !== r.overtimePremium; });
  valid = computed(() => this.days() >= 1 && this.hours() >= 1 && this.premium() >= 1);
  rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.store.agents()
      .filter((a) => (this.vendor() === 'All' || a.vendor === this.vendor()) && (!q || a.name.toLowerCase().includes(q) || a.employeeId.includes(q)))
      .map((a) => ({ a, basic: this.store.payrollFor(a).basic, custom: this.store.overtimeRates()[a.id] }));
  });

  setRate(id: string, v: string) {
    if (v === '' || v === null) { this.store.setOvertimeRate(id, null); return; }
    const rate = Number(v);
    if (!Number.isFinite(rate) || rate < 0) { this.toast.toast('An overtime rate must be 0 or more.'); return; }
    this.store.setOvertimeRate(id, rate);
  }

  rateFor(basic: number) {
    return (basic / this.days() / this.hours()) * this.premium();
  }

  reset() {
    const r = this.store.payrollRules();
    this.days.set(r.overtimeDays); this.hours.set(r.overtimeHoursPerDay); this.premium.set(r.overtimePremium);
  }

  save() {
    if (!this.valid()) return;
    this.store.savePayrollRules({ ...this.store.payrollRules(), overtimeDays: this.days(), overtimeHoursPerDay: this.hours(), overtimePremium: this.premium() });
    this.toast.toast('Overtime rate saved.');
  }
}
