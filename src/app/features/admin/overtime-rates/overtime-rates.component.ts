import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CrcStore, OvertimeRule } from '../../../core/services/crc-store.service';
import { AGENT_VENDORS, SETTINGS_UI } from '../settings-ui';

/** Each agent's own overtime rate, worked out from the formula on Overtime Settings (or their own override). */
@Component({
  selector: 'app-overtime-rates',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PageHeaderComponent],
  template: `
    <app-page-header
      title="Overtime Rates"
      subtitle="The rate used to price one overtime hour for each agent"
      [breadcrumbs]="[{ label: 'CSR Management', link: '/csr/directory' }, { label: 'Payroll Settings' }, { label: 'Overtime Rates' }]"
    ></app-page-header>

    <div class="surface-card overflow-hidden mb-4">
      <div class="flex items-center justify-between gap-3 flex-wrap px-4 py-3.5 border-b border-surface-border">
        <div>
          <h3 class="text-[13.5px] font-bold text-ink-900">Overtime rate per agent</h3>
          <p class="text-xs text-ink-400 mt-0.5">Formula and override rates, from the defaults on <a class="text-brand-600 font-medium" routerLink="/csr/overtime-settings">Overtime Settings</a>.</p>
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
                  <span class="font-semibold text-ink-900 tabular-nums">{{ (r.custom ?? r.formula) | number:'1.3-3' }}</span>
                </td>
              </tr>
            } @empty { <tr><td colspan="7" class="!text-center text-sm text-ink-400 !py-8">No agents match.</td></tr> }
          </tbody>
        </table>
      </div>
    </div>
    <p class="text-xs text-ink-400">Each agent's overtime hours and pay month by month are on <a class="text-brand-600 font-medium" routerLink="/csr/performance-overtime">Performance, Overtime &amp; Incentive</a>.</p>
  `,
})
export class OvertimeRatesComponent {
  store = inject(CrcStore);
  readonly ui = SETTINGS_UI;
  readonly vendors = AGENT_VENDORS;

  vendor = signal('All');
  contract = signal('All');
  line = signal('All');
  q = signal('');

  private all = computed(() => this.store.agents().map((a) => ({
    a, contract: this.store.contractOfAgent(a), rule: this.store.overtimeRuleFor(a), basic: this.store.payrollFor(a).basic,
    formula: this.store.formulaOvertimeRate(a), custom: this.store.overtimeRates()[a.id],
  })));
  rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.all().filter((r) => (this.vendor() === 'All' || r.a.vendor === this.vendor()) && (this.contract() === 'All' || r.contract === this.contract())
      && (this.line() === 'All' || r.a.queue === this.line()) && (!q || r.a.name.toLowerCase().includes(q) || r.a.employeeId.includes(q)));
  });
  contractOptions = computed(() => ['All', ...new Set(this.all().map((r) => r.contract).sort())]);
  lineOptions = computed(() => ['All', ...new Set(this.store.agents().map((a) => a.queue).sort())]);

  ruleLabel(r: OvertimeRule) {
    return [r.vendor, r.contract, r.line].filter((x) => x !== 'All').join(' · ');
  }
}
