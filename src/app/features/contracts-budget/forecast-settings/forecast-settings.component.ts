import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { RequiresDirective } from '../../../shared/directives/requires.directive';
import { UiService } from '../../../shared/services/ui.service';
import { ForecastService, MONTHS, MONTH_SHORT, TX_TYPES } from '../../../core/services/forecast.service';

const FIELD = 'w-full px-3 py-2 text-sm rounded-lg border border-surface-border bg-white text-ink-800 focus:outline-none focus:border-brand-400';
/** The base figures behind the Team and Transaction forecasts. (The accrual forecast is typed per line and month on its own screen.) */
@Component({
  selector: 'app-forecast-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, PageHeaderComponent, RequiresDirective],
  template: `
    <app-page-header
      title="Forecast Settings"
      subtitle="The transaction rates and budget, and each team's approved budget"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Forecast' }, { label: 'Settings' }]"
    >
      <button mat-stroked-button (click)="reset()" [disabled]="!dirty()">Discard changes</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="!dirty()" appRequires="Configure Forecast"><mat-icon class="!text-base !mr-1">save</mat-icon>Save settings</button>
    </app-page-header>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <section class="surface-card px-5 py-4 xl:col-span-2">
        <h3 class="text-[13.5px] font-bold text-ink-900">Transaction forecast</h3>
        <p class="text-xs text-ink-400 mt-0.5 mb-3">A forecast month costs the expected transactions × the unit rate. The saving is measured against the approved budget.</p>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-4xl">
          <label class="block"><span class="lbl">Approved budget for the year (OMR)</span><input type="number" min="0" [class]="field" [(ngModel)]="txBudget" (ngModelChange)="touch()"></label>
          @for (t of txTypes; track t.type) {
            <label class="block"><span class="lbl">{{ t.type }} — OMR per transaction</span><input type="number" min="0" step="0.001" [class]="field" [(ngModel)]="rates[t.type]" (ngModelChange)="touch()"></label>
          }
        </div>
      </section>

      <section class="surface-card px-5 py-4 xl:col-span-2">
        <h3 class="text-[13.5px] font-bold text-ink-900">Team approved budgets</h3>
        <p class="text-xs text-ink-400 mt-0.5 mb-3">The approved budget of each team on the salary PO for every month (it follows the contract, so months can differ), and its approved head count. Saving on the Team Forecast is measured against these.</p>
        <div class="overflow-x-auto">
          <table class="crc-table w-full text-sm">
            <thead><tr class="bg-surface-subtle text-left text-[11px] text-ink-500 uppercase tracking-wide">
              <th class="px-3 py-2.5 font-medium sticky left-0 bg-surface-subtle z-10 min-w-[210px]">Team</th>
              @for (m of months; track m) { <th class="px-1 py-2.5 font-medium text-right">{{ short[m] }}</th> }
              <th class="px-3 py-2.5 font-medium text-right">Year</th><th class="px-2 py-2.5 font-medium text-right whitespace-nowrap">Approved HC</th>
            </tr></thead>
            <tbody>
              @for (t of teams; track t.name) {
                <tr class="border-t border-surface-border">
                  <td class="px-3 py-1.5 font-medium text-ink-900 sticky left-0 bg-white z-10">{{ t.name }}@if (t.from > 0) { <span class="block text-[11px] font-normal text-ink-400">joins in {{ short[t.from] }}</span> }</td>
                  @for (m of months; track m) {
                    <td class="px-1 py-1.5">
                      @if (m >= t.from) { <input type="number" min="0" class="cell" [(ngModel)]="t.budget[m]" (ngModelChange)="touch()"> }
                      @else { <span class="block text-center text-ink-300">—</span> }
                    </td>
                  }
                  <td class="px-3 py-1.5 text-right font-semibold whitespace-nowrap">{{ yearOf(t) | number:'1.0-0' }}</td>
                  <td class="px-2 py-1.5"><input type="number" min="0" class="cell !w-16" [(ngModel)]="t.approvedHc" (ngModelChange)="touch()" placeholder="—"></td>
                </tr>
              }
            </tbody>
            <tfoot><tr class="border-t-2 border-surface-border font-bold bg-surface-subtle/50">
              <td class="px-3 py-2.5 sticky left-0 bg-surface-subtle z-10">Total</td>
              @for (m of months; track m) { <td class="px-1 py-2.5 text-right text-xs">{{ monthOf(m) | number:'1.0-0' }}</td> }
              <td class="px-3 py-2.5 text-right">{{ grand() | number:'1.0-0' }}</td><td></td>
            </tr></tfoot>
          </table>
        </div>
      </section>
    </div>
  `,
  styles: [`.cell { width: 92px; padding: 5px 6px; font-size: 12px; text-align: right; border: 1px solid #e3e2ec; border-radius: 6px; background: #fff; } .cell:focus { outline: none; border-color: #fb923c; } .lbl { display: block; font-size: 10.5px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }`],
})
export class ForecastSettingsComponent {
  svc = inject(ForecastService);
  private ui = inject(UiService);

  field = FIELD;
  txTypes = TX_TYPES;
  months = MONTHS;
  short = MONTH_SHORT;
  dirty = signal(false);

  txBudget!: number;
  rates!: Record<string, number>;
  teams!: Array<{ name: string; from: number; budget: number[]; approvedHc: number | null }>;

  yearOf = (t: { budget: number[] }) => t.budget.reduce((s, b) => s + (Number(b) || 0), 0);
  monthOf = (m: number) => this.teams.reduce((s, t) => s + (Number(t.budget[m]) || 0), 0);
  grand = () => this.teams.reduce((s, t) => s + this.yearOf(t), 0);

  constructor() { this.reset(); }

  touch() { this.dirty.set(true); }

  reset() {
    this.txBudget = this.svc.txBudget();
    this.rates = { ...this.svc.txRates() };
    this.teams = this.svc.teams().map((t) => ({ name: t.name, from: t.from, budget: [...t.budget], approvedHc: t.approvedHc }));
    this.dirty.set(false);
  }

  save() {
    if (!this.ui.requires('Configure Forecast')) return;
    const bad = [this.txBudget, ...Object.values(this.rates), ...this.teams.flatMap((t) => t.budget)].some((n) => n === null || n === undefined || !isFinite(Number(n)) || Number(n) < 0);
    if (bad) { this.ui.toast('Budgets and rates must be numbers, 0 or more.', 5000); return; }
    this.svc.setTxSettings(Number(this.txBudget), Object.fromEntries(Object.entries(this.rates).map(([k, v]) => [k, Number(v)])));
    this.svc.saveTeamBudgets(this.teams.map((t) => ({ name: t.name, budget: t.budget.map(Number), approvedHc: t.approvedHc === null || (t.approvedHc as any) === '' ? null : Number(t.approvedHc) })));
    this.dirty.set(false);
    this.ui.toast('Forecast settings saved.');
  }
}
