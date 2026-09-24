import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { RequiresDirective } from '../../../shared/directives/requires.directive';
import { UiService } from '../../../shared/services/ui.service';
import { ACCRUAL_RULES, AccrualRule, ForecastService, TX_TYPES } from '../../../core/services/forecast.service';

const FIELD = 'w-full px-3 py-2 text-sm rounded-lg border border-surface-border bg-white text-ink-800 focus:outline-none focus:border-brand-400';
const RULE_HELP: Record<AccrualRule, string> = {
  'Last actual carried forward': 'Each forecast month repeats the line\'s last invoiced amount.',
  'Average of the last 3 actual months': 'Each forecast month is the average of the line\'s last three invoiced months.',
  'Contract monthly share': 'Each forecast month is the contract value spread evenly over its months and PO lines.',
};

/** The rules and base figures behind the Accrual, Team and Transaction forecasts. */
@Component({
  selector: 'app-forecast-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, PageHeaderComponent, RequiresDirective],
  template: `
    <app-page-header
      title="Forecast Settings"
      subtitle="The rule behind the accrual forecast, the transaction rates and budget, and each team's approved budget"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Forecast' }, { label: 'Settings' }]"
    >
      <button mat-stroked-button (click)="reset()" [disabled]="!dirty()">Discard changes</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="!dirty()" appRequires="Configure Forecast"><mat-icon class="!text-base !mr-1">save</mat-icon>Save settings</button>
    </app-page-header>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <section class="surface-card px-5 py-4">
        <h3 class="text-[13.5px] font-bold text-ink-900">Accrual forecast</h3>
        <p class="text-xs text-ink-400 mt-0.5 mb-3">How a PO line is forecast when nobody typed a figure. The salary line follows the Team Forecast and the Voice / Non Voice lines follow the Transaction Forecast.</p>
        <div class="space-y-2">
          @for (r of rules; track r) {
            <label class="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer" [class]="rule === r ? 'border-brand-300 bg-brand-50' : 'border-surface-border'">
              <input type="radio" name="rule" class="mt-1" [checked]="rule === r" (change)="rule = r; touch()">
              <span><span class="text-sm font-semibold text-ink-900">{{ r }}</span><span class="block text-xs text-ink-500">{{ help[r] }}</span></span>
            </label>
          }
        </div>
      </section>

      <section class="surface-card px-5 py-4">
        <h3 class="text-[13.5px] font-bold text-ink-900">Transaction forecast</h3>
        <p class="text-xs text-ink-400 mt-0.5 mb-3">A forecast month costs the expected transactions × the unit rate. The saving is measured against the approved budget.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label class="block sm:col-span-2"><span class="lbl">Approved budget for the year (OMR)</span><input type="number" min="0" [class]="field" [(ngModel)]="txBudget" (ngModelChange)="touch()"></label>
          @for (t of txTypes; track t.type) {
            <label class="block"><span class="lbl">{{ t.type }} — OMR per transaction</span><input type="number" min="0" step="0.001" [class]="field" [(ngModel)]="rates[t.type]" (ngModelChange)="touch()"></label>
          }
        </div>
      </section>

      <section class="surface-card px-5 py-4 xl:col-span-2">
        <h3 class="text-[13.5px] font-bold text-ink-900">Team approved budgets</h3>
        <p class="text-xs text-ink-400 mt-0.5 mb-3">The approved monthly budget and head count of each team on the salary PO. Saving on the Team Forecast is measured against these.</p>
        <div class="overflow-x-auto">
          <table class="crc-table w-full text-sm">
            <thead><tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide"><th class="px-3 py-2.5 font-medium">Team</th><th class="px-3 py-2.5 font-medium w-56">Approved budget per month (OMR)</th><th class="px-3 py-2.5 font-medium w-44">Approved head count</th></tr></thead>
            <tbody>
              @for (t of teams; track t.name) {
                <tr class="border-t border-surface-border">
                  <td class="px-3 py-2 font-medium text-ink-900">{{ t.name }}</td>
                  <td class="px-3 py-2"><input type="number" min="0" [class]="field" [(ngModel)]="t.budget" (ngModelChange)="touch()"></td>
                  <td class="px-3 py-2"><input type="number" min="0" [class]="field" [(ngModel)]="t.approvedHc" (ngModelChange)="touch()" placeholder="—"></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `,
  styles: [`.lbl { display: block; font-size: 10.5px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }`],
})
export class ForecastSettingsComponent {
  svc = inject(ForecastService);
  private ui = inject(UiService);

  field = FIELD;
  rules = ACCRUAL_RULES;
  help = RULE_HELP;
  txTypes = TX_TYPES;
  dirty = signal(false);

  rule!: AccrualRule;
  txBudget!: number;
  rates!: Record<string, number>;
  teams!: Array<{ name: string; budget: number; approvedHc: number | null }>;

  constructor() { this.reset(); }

  touch() { this.dirty.set(true); }

  reset() {
    this.rule = this.svc.accrualRule();
    this.txBudget = this.svc.txBudget();
    this.rates = { ...this.svc.txRates() };
    this.teams = this.svc.teams().map((t) => ({ name: t.name, budget: t.budget.find((b) => b > 0) ?? 0, approvedHc: t.approvedHc }));
    this.dirty.set(false);
  }

  save() {
    if (!this.ui.requires('Configure Forecast')) return;
    const bad = [this.txBudget, ...Object.values(this.rates), ...this.teams.map((t) => t.budget)].some((n) => n === null || n === undefined || !isFinite(Number(n)) || Number(n) < 0);
    if (bad) { this.ui.toast('Budgets and rates must be numbers, 0 or more.', 5000); return; }
    this.svc.setAccrualRule(this.rule);
    this.svc.setTxSettings(Number(this.txBudget), Object.fromEntries(Object.entries(this.rates).map(([k, v]) => [k, Number(v)])));
    this.svc.saveTeamBudgets(this.teams.map((t) => ({ name: t.name, budget: Number(t.budget), approvedHc: t.approvedHc === null || (t.approvedHc as any) === '' ? null : Number(t.approvedHc) })));
    this.dirty.set(false);
    this.ui.toast('Forecast settings saved.');
  }
}
