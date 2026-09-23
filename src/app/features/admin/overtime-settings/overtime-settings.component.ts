import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CrcStore, OvertimeRule } from '../../../core/services/crc-store.service';
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

    <div class="surface-card overflow-hidden mb-6">
      <div class="flex items-center justify-between gap-3 flex-wrap px-4 py-3.5 border-b border-surface-border">
        <div>
          <h3 class="text-[13.5px] font-bold text-ink-900">Overtime rules by vendor, contract and line</h3>
          <p class="text-xs text-ink-400 mt-0.5">A rule replaces the default for the agents it covers. When several rules cover an agent, the most specific one wins. Changes are written to the audit log.</p>
        </div>
        <button type="button" [class]="ui.save" (click)="editRule()"><mat-icon class="!text-[17px] !w-[17px] !h-[17px]">add</mat-icon>Add rule</button>
      </div>
      <div class="overflow-x-auto">
        <table class="crc-table w-full">
          <thead><tr class="text-left"><th>Vendor</th><th>Contract</th><th>Line</th><th>Formula</th><th class="text-right">Agents covered</th><th></th></tr></thead>
          <tbody>
            @for (r of rules(); track r.rule.id) {
              <tr>
                <td>{{ r.rule.vendor === 'All' ? 'Any vendor' : r.rule.vendor }}</td>
                <td>{{ r.rule.contract === 'All' ? 'Any contract' : r.rule.contract }}</td>
                <td>{{ r.rule.line === 'All' ? 'Any line' : r.rule.line }}</td>
                <td class="tabular-nums">Basic <span [class]="ui.op">&divide;</span> {{ r.rule.days }} <span [class]="ui.op">&divide;</span> {{ r.rule.hoursPerDay }} <span [class]="ui.op">&times;</span> {{ r.rule.premium }}</td>
                <td class="text-right tabular-nums">{{ r.agents }}</td>
                <td class="text-right whitespace-nowrap">
                  <button type="button" class="text-xs font-semibold text-brand-700 px-2 py-1 rounded-md hover:bg-brand-50" (click)="editRule(r.rule)">Edit</button>
                  <button type="button" class="text-xs font-semibold text-status-red px-2 py-1 rounded-md hover:bg-red-50" (click)="deleteRule(r.rule.id)">Delete</button>
                </td>
              </tr>
            } @empty { <tr><td colspan="6" class="!text-center text-sm text-ink-400 !py-6">No rules yet — every agent follows the default above.</td></tr> }
          </tbody>
        </table>
      </div>
    </div>

    <div class="surface-card overflow-hidden mb-4">
      <div class="flex items-center justify-between gap-3 flex-wrap px-4 py-3.5 border-b border-surface-border">
        <div>
          <h3 class="text-[13.5px] font-bold text-ink-900">Overtime rate per agent</h3>
          <p class="text-xs text-ink-400 mt-0.5">Type a rate to give an agent their own; clear it to go back to the default{{ dirty() ? ' (default shown with the unsaved values)' : '' }}. Changes are written to the audit log.</p>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-2.5 w-full lg:w-auto lg:min-w-[720px]">
          <select [class]="ui.field" (change)="vendor.set($any($event.target).value)">
            @for (v of vendors; track v) { <option [value]="v" [selected]="v === vendor()">{{ v === 'All' ? 'All vendors' : v }}</option> }
          </select>
          <select [class]="ui.field" (change)="contract.set($any($event.target).value)">
            @for (c of contractOptions(); track c) { <option [value]="c" [selected]="c === contract()">{{ c === 'All' ? 'All contracts' : c === '—' ? 'No contract (OJT)' : c }}</option> }
          </select>
          <select [class]="ui.field" (change)="line.set($any($event.target).value)">
            @for (l of lineOptions(); track l) { <option [value]="l" [selected]="l === line()">{{ l === 'All' ? 'All lines' : l }}</option> }
          </select>
          <input type="search" [class]="ui.field" placeholder="Search name or employee ID" [ngModel]="q()" (ngModelChange)="q.set($event)" />
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="crc-table w-full">
          <thead><tr class="text-left"><th>Employee</th><th>Vendor</th><th>Contract</th><th>Rule</th><th class="text-right">Basic salary (OMR)</th><th class="text-right">Formula rate</th><th class="text-right">Overtime rate (OMR / hour)</th></tr></thead>
          <tbody>
            @for (r of rows(); track r.a.id) {
              <tr>
                <td><a class="font-semibold text-ink-900 hover:text-brand-700" [routerLink]="['/csr/directory', r.a.id]">{{ r.a.name }}</a><div class="text-[11px] text-ink-400">{{ r.a.employeeId }} &middot; {{ r.a.queue }}</div></td>
                <td>{{ r.a.vendor }}</td>
                <td>{{ r.contract === '—' ? 'No contract' : r.contract }}</td>
                <td class="text-xs">{{ r.rule ? ruleLabel(r.rule) : 'Default' }}</td>
                <td class="text-right tabular-nums">{{ r.basic | number:'1.3-3' }}</td>
                <td class="text-right tabular-nums text-ink-400">{{ r.formula | number:'1.3-3' }}</td>
                <td class="text-right whitespace-nowrap">
                  @if (r.custom !== undefined) { <span class="status-chip status-chip--info mr-1.5">Own rate</span> }
                  <input type="number" min="0" step="0.001" [class]="ui.num" [placeholder]="(r.formula | number:'1.3-3') ?? ''" [ngModel]="r.custom ?? null" (change)="setRate(r.a.id, $any($event.target).value)" />
                </td>
              </tr>
            } @empty { <tr><td colspan="7" class="!text-center text-sm text-ink-400 !py-8">No agents match.</td></tr> }
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
  contract = signal('All');
  line = signal('All');
  q = signal('');

  dirty = computed(() => { const r = this.store.payrollRules(); return this.days() !== r.overtimeDays || this.hours() !== r.overtimeHoursPerDay || this.premium() !== r.overtimePremium; });
  valid = computed(() => this.days() >= 1 && this.hours() >= 1 && this.premium() >= 1);
  /** The default on screen (possibly unsaved), for the formula-rate preview. */
  private draft = computed(() => ({ ...this.store.payrollRules(), overtimeDays: this.days(), overtimeHoursPerDay: this.hours(), overtimePremium: this.premium() }));
  private all = computed(() => this.store.agents().map((a) => ({
    a, contract: this.store.contractOfAgent(a), rule: this.store.overtimeRuleFor(a), basic: this.store.payrollFor(a).basic,
    formula: this.store.formulaOvertimeRate(a, this.draft()), custom: this.store.overtimeRates()[a.id],
  })));
  rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.all().filter((r) => (this.vendor() === 'All' || r.a.vendor === this.vendor()) && (this.contract() === 'All' || r.contract === this.contract())
      && (this.line() === 'All' || r.a.queue === this.line()) && (!q || r.a.name.toLowerCase().includes(q) || r.a.employeeId.includes(q)));
  });
  contractOptions = computed(() => ['All', ...new Set(this.all().map((r) => r.contract).sort())]);
  lineOptions = computed(() => ['All', ...new Set(this.store.agents().map((a) => a.queue).sort())]);
  rules = computed(() => this.store.overtimeRules().map((rule) => ({ rule, agents: this.all().filter((r) => r.rule?.id === rule.id).length })));

  ruleLabel(r: OvertimeRule) {
    return [r.vendor, r.contract, r.line].filter((x) => x !== 'All').join(' · ');
  }

  async editRule(rule?: OvertimeRule) {
    const opts = (list: string[], any: string) => list.map((v) => ({ value: v, label: v === 'All' ? any : v === '—' ? 'No contract (OJT)' : v }));
    const d = this.store.payrollRules();
    const v = await this.toast.form({
      title: rule ? 'Edit overtime rule' : 'Add overtime rule', subtitle: 'Pick what the rule covers — leave a field on "Any" to cover all of it', icon: 'more_time', submitLabel: 'Save rule',
      values: rule ? { ...rule } : { vendor: 'All', contract: 'All', line: 'All', days: d.overtimeDays, hoursPerDay: d.overtimeHoursPerDay, premium: d.overtimePremium },
      fields: [
        { key: 'vendor', label: 'Vendor', type: 'select', required: true, options: opts(this.vendors, 'Any vendor') },
        { key: 'contract', label: 'Contract', type: 'select', required: true, options: opts(this.contractOptions(), 'Any contract') },
        { key: 'line', label: 'Line', type: 'select', required: true, options: opts(this.lineOptions(), 'Any line') },
        { key: 'days', label: 'Days per month', type: 'number', required: true, min: 1, max: 31 },
        { key: 'hoursPerDay', label: 'Hours per day', type: 'number', required: true, min: 1, max: 24 },
        { key: 'premium', label: 'Premium (×)', type: 'number', required: true, min: 1 },
      ],
    });
    if (!v) return;
    if (v['vendor'] === 'All' && v['contract'] === 'All' && v['line'] === 'All') { this.toast.toast('Pick a vendor, a contract or a line — a rule for everyone is the default at the top.'); return; }
    const [days, hoursPerDay, premium] = [Number(v['days']), Number(v['hoursPerDay']), Number(v['premium'])];
    if (!(days >= 1 && hoursPerDay >= 1 && premium >= 1)) { this.toast.toast('Days and hours must be at least 1, and the premium at least 1.'); return; }
    this.store.saveOvertimeRule({ id: rule?.id, vendor: v['vendor'], contract: v['contract'], line: v['line'], days, hoursPerDay, premium });
    this.toast.toast('Overtime rule saved.');
  }

  async deleteRule(id: string) {
    const ok = await this.toast.confirm({ title: 'Delete this overtime rule?', message: 'The agents it covers go back to the default rate (or another rule that covers them).', confirmLabel: 'Delete', danger: true, icon: 'delete' });
    if (ok) this.store.deleteOvertimeRule(id);
  }

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
