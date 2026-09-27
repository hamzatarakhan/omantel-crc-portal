import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { RequiresDirective } from '../../../shared/directives/requires.directive';
import { UiService } from '../../../shared/services/ui.service';
import { CrcStore } from '../../../core/services/crc-store.service';
import { infolineFirst } from '../../../core/services/contract-data';
import { ForecastService, TX_TYPES } from '../../../core/services/forecast.service';

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
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'CSR Forecast' }, { label: 'Settings' }]"
    >
      <button mat-stroked-button (click)="reset()" [disabled]="!dirty()">Discard changes</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="!dirty()" appRequires="Configure Forecast"><mat-icon class="!text-base !mr-1">save</mat-icon>Save settings</button>
    </app-page-header>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <section class="surface-card px-5 py-4 xl:col-span-2">
        <h3 class="text-[13.5px] font-bold text-ink-900">Transaction forecast</h3>
        <p class="text-xs text-ink-400 mt-0.5 mb-3">A forecast month costs the expected transactions × the unit rate. The saving is measured against the approved budget. These belong to the contract selected below.</p>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-4xl mb-3">
          <label class="block"><span class="lbl">Vendor</span>
            <select [class]="field" (change)="onTxVendorChange($any($event.target).value)">
              <option value="All" [selected]="txVendor === 'All'">All vendors</option>
              @for (v of vendors(); track v) { <option [value]="v" [selected]="v === txVendor">{{ v }}</option> }
            </select></label>
          <label class="block"><span class="lbl">Contract</span>
            <select [class]="field" (change)="onTxContractChange($any($event.target).value)">
              @for (c of txContracts(); track c) { <option [value]="c" [selected]="c === txContract">{{ c }}</option> }
            </select></label>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-4xl">
          <label class="block"><span class="lbl">Approved budget for the year (OMR)</span><input type="number" min="0" [class]="field" [(ngModel)]="txBudget" (ngModelChange)="touch()"></label>
          @for (t of txTypes; track t.type) {
            <label class="block"><span class="lbl">{{ t.type }} — OMR per transaction</span><input type="number" min="0" step="0.001" [class]="field" [(ngModel)]="rates[t.type]" (ngModelChange)="touch()"></label>
          }
        </div>
      </section>

      <section class="surface-card px-5 py-4 xl:col-span-2">
        <h3 class="text-[13.5px] font-bold text-ink-900">Team approved budgets</h3>
        <p class="text-xs text-ink-400 mt-0.5 mb-3">The approved budget of each team for every month of the contract and year selected below, and its approved head count. Saving on the Team Forecast is measured against these.</p>
        <div class="grid grid-cols-1 sm:grid-cols-3 max-w-4xl gap-3 mb-3">
          <label class="block"><span class="lbl">Vendor</span>
            <select [class]="field" (change)="onTeamVendorChange($any($event.target).value)">
              <option value="All" [selected]="teamVendor === 'All'">All vendors</option>
              @for (v of vendors(); track v) { <option [value]="v" [selected]="v === teamVendor">{{ v }}</option> }
            </select></label>
          <label class="block"><span class="lbl">Contract</span>
            <select [class]="field" (change)="onTeamContractChange($any($event.target).value)">
              @for (c of teamContracts(); track c) { <option [value]="c" [selected]="c === teamContract">{{ c }}</option> }
            </select></label>
          <label class="block"><span class="lbl">Year of budget</span>
            <select [class]="field" (change)="onTeamYearChange(+$any($event.target).value)">
              @for (y of teamYears; track y.year) { <option [value]="y.year" [selected]="y.year === teamYear">{{ y.label }}</option> }
            </select></label>
        </div>
        @if (!teamTracked()) {
          <p class="text-xs text-status-amber font-semibold mb-3">This contract has no team roster yet — the figures below are all zero. Team budgets currently belong to {{ svc.teamContract()?.reference ?? 'the salary PO' }}.</p>
        }
        <div class="overflow-x-auto">
          <table class="crc-table w-full text-sm">
            <thead><tr class="bg-surface-subtle text-left text-[11px] text-ink-500 uppercase tracking-wide">
              <th class="px-3 py-2.5 font-medium sticky left-0 bg-surface-subtle z-10 min-w-[210px]">Team</th>
              @for (m of months; track m) { <th class="px-1 py-2.5 font-medium text-right whitespace-nowrap">{{ monthLabel(m) }}</th> }
              <th class="px-3 py-2.5 font-medium text-right">Total</th><th class="px-2 py-2.5 font-medium text-right whitespace-nowrap">Approved HC</th>
            </tr></thead>
            <tbody>
              @for (t of teams; track t.name) {
                <tr class="border-t border-surface-border">
                  <td class="px-3 py-1.5 font-medium text-ink-900 sticky left-0 bg-white z-10">{{ t.name }}@if (joinLabel(t); as jl) { <span class="block text-[11px] font-normal text-ink-400">joins in {{ jl }}</span> }</td>
                  @for (m of months; track m) {
                    <td class="px-1 py-1.5">
                      @if (startedHere(t.name, m)) { <input type="number" min="0" class="cell" [(ngModel)]="t.budget[m]" (ngModelChange)="touch()"> }
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
  private store = inject(CrcStore);
  private ui = inject(UiService);

  field = FIELD;
  txTypes = TX_TYPES;
  dirty = signal(false);

  private activeContracts = () => this.store.contracts().filter((c) => c.status !== 'Cancelled');
  vendors = () => [...new Set(this.activeContracts().map((c) => c.vendorName))].sort(infolineFirst);
  contractsFor = (vendor: string) => this.activeContracts().filter((c) => vendor === 'All' || c.vendorName === vendor).map((c) => c.reference);

  txVendor!: string;
  txContract!: string;
  txBudget!: number;
  rates!: Record<string, number>;
  txContracts = () => this.contractsFor(this.txVendor);

  teamVendor!: string;
  teamContract!: string;
  teamYear!: number | null;
  teamContracts = () => this.contractsFor(this.teamVendor);
  teamYears!: Array<{ year: number; label: string; from: string; to: string }>;
  months!: string[];
  teams!: Array<{ name: string; approvedHc: number | null; budget: Record<string, number> }>;

  /** Team budgets only exist for the salary PO's contract; any other contract has no team roster to show yet. */
  teamTracked = () => this.teamContract === this.svc.teamContract()?.reference;
  /** Guards svc.started() with teamTracked() — its date keys aren't contract-specific, so an unrelated contract could otherwise show phantom "started" months that happen to share the same calendar dates. */
  startedHere = (team: string, m: string) => this.teamTracked() && this.svc.started(team, m);
  monthLabel = (m: string) => this.svc.monthShortLabel(m);
  joinLabel = (t: { name: string }) => { const first = this.months.find((m) => this.startedHere(t.name, m)); return first && first !== this.months[0] ? this.svc.monthShortLabel(first) : null; };
  yearOf = (t: { budget: Record<string, number> }) => Object.values(t.budget).reduce((s, b) => s + (Number(b) || 0), 0);
  monthOf = (m: string) => this.teams.reduce((s, t) => s + (Number(t.budget[m]) || 0), 0);
  grand = () => this.teams.reduce((s, t) => s + this.yearOf(t), 0);

  constructor() { this.reset(); }

  touch() { this.dirty.set(true); }

  private defaultYear(list: Array<{ year: number; from: string; to: string }>): number | null {
    const today = new Date().toISOString().slice(0, 10);
    const current = list.find((y) => y.from <= today && y.to >= today);
    return current?.year ?? list[list.length - 1]?.year ?? null;
  }

  private pickContract(list: string[], current: string): string {
    if (list.includes(current)) return current;
    const tracked = this.svc.teamContract()?.reference;
    return (tracked && list.includes(tracked)) ? tracked : (list[0] ?? '');
  }

  onTxVendorChange(vendor: string) {
    this.txVendor = vendor;
    this.onTxContractChange(this.pickContract(this.txContracts(), this.txContract));
  }

  onTxContractChange(ref: string) {
    this.txContract = ref;
    this.txBudget = this.svc.txBudgetOf(ref);
    this.rates = { ...this.svc.txRatesOf(ref) };
  }

  onTeamVendorChange(vendor: string) {
    this.teamVendor = vendor;
    this.onTeamContractChange(this.pickContract(this.teamContracts(), this.teamContract));
  }

  onTeamContractChange(ref: string) {
    this.teamContract = ref;
    this.teamYears = this.svc.teamYearsOf(ref);
    this.loadTeamYear(this.defaultYear(this.teamYears));
  }

  onTeamYearChange(year: number) { this.loadTeamYear(year); }

  private loadTeamYear(year: number | null) {
    this.teamYear = year;
    const y = this.teamYears.find((x) => x.year === year);
    this.months = y ? this.svc.monthsBetween(y.from, y.to) : [];
    this.teams = this.svc.teams().map((t) => ({ name: t.name, approvedHc: t.approvedHc, budget: Object.fromEntries(this.months.filter((m) => this.startedHere(t.name, m)).map((m) => [m, this.svc.teamBudget(t.name, m)])) }));
  }

  reset() {
    const trackedVendor = this.svc.teamContract()?.vendorName ?? 'All';
    this.onTxVendorChange(trackedVendor);
    this.onTeamVendorChange(trackedVendor);
    this.dirty.set(false);
  }

  save() {
    if (!this.ui.requires('Configure Forecast')) return;
    const bad = [this.txBudget, ...Object.values(this.rates), ...this.teams.flatMap((t) => Object.values(t.budget))].some((n) => n === null || n === undefined || !isFinite(Number(n)) || Number(n) < 0);
    if (bad) { this.ui.toast('Budgets and rates must be numbers, 0 or more.', 5000); return; }
    this.svc.setTxSettings(this.txContract, Number(this.txBudget), Object.fromEntries(Object.entries(this.rates).map(([k, v]) => [k, Number(v)])));
    this.svc.saveTeamBudgets(this.teams.map((t) => ({ name: t.name, budget: Object.fromEntries(Object.entries(t.budget).map(([m, v]) => [m, Number(v)])), approvedHc: t.approvedHc === null || (t.approvedHc as any) === '' ? null : Number(t.approvedHc) })));
    this.dirty.set(false);
    this.ui.toast('Forecast settings saved.');
  }
}
