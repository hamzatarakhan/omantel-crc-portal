import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { RequiresDirective } from '../../../shared/directives/requires.directive';
import { UiService } from '../../../shared/services/ui.service';
import { AccrualForecast, AccrualSettings, MONTH_LONG, RULES, TEAMS, TeamForecast } from '../../../core/services/forecast.service';

const FIELD = 'w-full px-3 py-2 text-sm rounded-lg border border-surface-border bg-white text-ink-800 focus:outline-none focus:border-brand-400';
const CONTRACT_TYPES = ['Outsourcing', 'Facilities Management', 'Training Services', 'IT Services'];

/** AF-020 – AF-024: how and when the accrual forecast is generated, which rules it follows, and when a period locks. */
@Component({
  selector: 'app-forecast-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, PageHeaderComponent, StatusChipComponent, RequiresDirective],
  template: `
    <app-page-header
      title="Forecast Settings"
      subtitle="Set when the accrual forecast is generated, which rules it follows and when a month locks"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Forecast' }, { label: 'Settings' }]"
    >
      <button mat-stroked-button (click)="reset()" [disabled]="!dirty()">Discard changes</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="!dirty()" appRequires="Configure Forecast"><mat-icon class="!text-base !mr-1">save</mat-icon>Save settings</button>
    </app-page-header>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <section class="surface-card px-5 py-4">
        <h3 class="text-[13.5px] font-bold text-ink-900">Generation</h3>
        <p class="text-xs text-ink-400 mt-0.5 mb-3">Next automatic run: <b class="text-ink-600">{{ svc.nextRun() }}</b> (saved settings).</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label class="block sm:col-span-2"><span class="lbl">How often</span>
            <select [class]="field" [(ngModel)]="d.frequency" (ngModelChange)="touch()">
              <option value="Monthly">Monthly (automatic)</option><option value="Monthly with manual confirmation">Monthly, waits for a manual confirmation</option><option value="Manual">Manual only</option>
            </select></label>
          <label class="block"><span class="lbl">Which day</span>
            <select [class]="field" [(ngModel)]="d.dayRule" (ngModelChange)="touch()">
              <option value="First day of the month">First day of the month</option><option value="Specific day of the month">A specific day</option><option value="Last working day of the month">Last working day of the month</option>
            </select></label>
          @if (d.dayRule === 'Specific day of the month') {
            <label class="block"><span class="lbl">Day of the month</span><input type="number" min="1" max="31" [class]="field" [(ngModel)]="d.day" (ngModelChange)="touch()"></label>
          }
          <label class="block"><span class="lbl">Financial year</span><input [class]="field + ' bg-surface-subtle'" [value]="d.year" disabled></label>
          <label class="block"><span class="lbl">Forecast starts</span>
            <select [class]="field" [(ngModel)]="d.startMonth" (ngModelChange)="touch()">@for (m of months; track $index) { <option [ngValue]="$index">{{ m }}</option> }</select></label>
          <label class="block"><span class="lbl">Forecast ends</span>
            <select [class]="field" [(ngModel)]="d.endMonth" (ngModelChange)="touch()">@for (m of months; track $index) { <option [ngValue]="$index">{{ m }}</option> }</select></label>
        </div>
        @if (d.dayRule === 'Specific day of the month') { <p class="text-xs text-ink-400 mt-2">A month that has no day {{ d.day || 'N' }} runs on its last day instead. Last working day skips Friday and Saturday.</p> }
        <div class="mt-3"><span class="lbl">Contract types included</span>
          <div class="flex flex-wrap gap-2 mt-1">
            @for (t of types; track t) {
              <label class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer" [class]="d.contractTypes.includes(t) ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-surface-border text-ink-600'">
                <input type="checkbox" [checked]="d.contractTypes.includes(t)" (change)="toggleType(t)" class="accent-[#0f766e]"> {{ t }}
              </label>
            }
          </div>
        </div>
        <div class="mt-4 flex items-center gap-3 flex-wrap"><button mat-stroked-button (click)="runNow()" appRequires="Configure Forecast"><mat-icon class="!text-base !mr-1">play_arrow</mat-icon>Run the schedule now</button><span class="text-xs text-ink-400">Does what the scheduler does on the generation day, using the saved settings.</span></div>
      </section>

      <section class="surface-card px-5 py-4">
        <h3 class="text-[13.5px] font-bold text-ink-900">Forecast rules</h3>
        <p class="text-xs text-ink-400 mt-0.5 mb-3">What each component of the current month is based on.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label class="block sm:col-span-2"><span class="lbl">Salary</span><input [class]="field + ' bg-surface-subtle'" value="Expected resource count × salary per resource" disabled></label>
          <label class="block"><span class="lbl">Overtime</span><select [class]="field" [(ngModel)]="d.overtimeRule" (ngModelChange)="touch()">@for (r of rules; track r) { <option [value]="r">{{ r }}</option> }</select></label>
          <label class="block"><span class="lbl">Performance</span><select [class]="field" [(ngModel)]="d.performanceRule" (ngModelChange)="touch()">@for (r of rules; track r) { <option [value]="r">{{ r }}</option> }</select></label>
          <label class="block sm:col-span-2"><span class="lbl">What "performance" means here</span>
            <select [class]="field" [(ngModel)]="d.performanceLabel" (ngModelChange)="touch()"><option>Incentive</option><option>Performance payment</option><option>Productivity-based payment</option><option>Other performance charges</option></select></label>
        </div>
        <p class="text-xs text-ink-400 mt-2">If last month has no actual amount yet, the latest available actual is used, then last month's forecast.</p>

        <h3 class="text-[13.5px] font-bold text-ink-900 mt-5">Invoices and closing</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <label class="block"><span class="lbl">Replace the forecast when the invoice is</span>
            <select [class]="field" [(ngModel)]="d.trigger" (ngModelChange)="touch()"><option value="Invoice approved">Approved</option><option value="Invoice issued">Issued (payment moved on from Pending)</option></select></label>
          <label class="block"><span class="lbl">A month can no longer be edited after</span>
            <select [class]="field" [(ngModel)]="d.lockAfter" (ngModelChange)="touch()"><option value="Invoice approval">Invoice approval</option><option value="Invoice issuance">Invoice issuance</option><option value="Month-end closure">Month-end closure</option><option value="Finance approval">Finance approval</option></select></label>
          <label class="block"><span class="lbl">Flag a variance above (%)</span><input type="number" min="0" max="100" [class]="field" [(ngModel)]="d.varianceThreshold" (ngModelChange)="touch()"></label>
          <label class="block"><span class="lbl">Close the previous month by day</span><input type="number" min="1" max="28" [class]="field" [(ngModel)]="d.closeByDay" (ngModelChange)="touch()"></label>
          <label class="flex items-center gap-2 sm:col-span-2 text-sm text-ink-700 cursor-pointer"><input type="checkbox" class="accent-[#0f766e]" [(ngModel)]="d.allowTotalOverride" (ngModelChange)="touch()"> Let CRC users type a new total when they edit the current month</label>
        </div>
      </section>
    </div>

    <section class="surface-card px-5 py-4 mt-4">
      <h3 class="text-[13.5px] font-bold text-ink-900">Team Forecast</h3>
      <p class="text-xs text-ink-400 mt-0.5 mb-3">Who receives the exported file, how teams are grouped, and which teams each role can see. These apply as soon as you change them.</p>
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-5">
        @if (team.showUnconfirmed) {
        <div>
          <span class="lbl">Budget Team recipients</span>
          <input [class]="field" [value]="team.recipients()" (change)="team.setRecipients($any($event.target).value); ui.toast('Recipients saved.')" placeholder="name@omantel.om, another@omantel.om">
          <p class="text-xs text-ink-400 mt-1.5">Used by "Export &amp; email" on the Team Forecast screen.</p>
        </div>
        }
        <div>
          <span class="lbl">Team groups</span>
          @for (g of team.groups(); track $index; let i = $index) {
            <div class="rounded-lg border border-surface-border p-2.5 mb-2">
              <div class="flex gap-2 mb-2"><input [class]="field" [value]="g.name" (change)="renameGroup(i, $any($event.target).value)"><button class="text-xs font-semibold text-ink-400 hover:text-status-red" (click)="removeGroup(i)">Remove</button></div>
              <div class="flex flex-wrap gap-1.5">@for (t of teams; track t) { <button [class]="chip(g.teams.includes(t))" (click)="toggleGroupTeam(i, t)">{{ t }}</button> }</div>
            </div>
          }
          <div class="flex gap-2"><input #ng [class]="field" placeholder="New group name" (keyup.enter)="addGroup(ng)"><button class="text-xs font-semibold text-brand-700 hover:underline whitespace-nowrap" (click)="addGroup(ng)">Add group</button></div>
        </div>
        <div>
          <span class="lbl">Team access by role</span>
          @for (r of team.scopeRoles; track r) {
            <div class="mb-2"><div class="text-xs font-semibold text-ink-700 mb-1">{{ r }}</div>
              <div class="flex flex-wrap gap-1.5">@for (t of teams; track t) { <button [class]="chip(canSee(r, t))" (click)="toggleScope(r, t)">{{ t }}</button> }</div></div>
          }
        </div>
      </div>
    </section>

    @if (problems().length) {
      <div class="surface-card px-4 py-3 mt-4 border-l-4 !border-l-status-red text-sm text-ink-700"><b>Fix before saving:</b> @for (p of problems(); track p) { <div>• {{ p }}</div> }</div>
    }

    <section class="surface-card mt-4 overflow-x-auto">
      <div class="flex items-center justify-between px-5 pt-4 pb-3"><div><h3 class="text-[13.5px] font-bold text-ink-900">Generation history</h3><p class="text-xs text-ink-400 mt-0.5">Every run, including the ones that failed</p></div></div>
      <table class="crc-table w-full text-sm">
        <thead><tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide"><th class="px-4 py-2 font-medium">When</th><th class="px-4 py-2 font-medium">Run</th><th class="px-4 py-2 font-medium">Month</th><th class="px-4 py-2 font-medium">Result</th><th class="px-4 py-2 font-medium text-right">Lines created</th><th class="px-4 py-2 font-medium">What happened</th></tr></thead>
        <tbody>
          @for (r of svc.runs(); track r.id) {
            <tr class="border-t border-surface-border"><td class="px-4 py-2 text-ink-600">{{ r.at | date:'medium' }}</td><td class="px-4 py-2">{{ r.trigger }}</td><td class="px-4 py-2">{{ r.month }}</td>
              <td class="px-4 py-2"><app-status-chip [label]="r.result" [level]="r.result === 'Success' ? 'normal' : 'red'"></app-status-chip></td><td class="px-4 py-2 text-right">{{ r.created }}</td><td class="px-4 py-2 text-ink-600">{{ r.note }}</td></tr>
          }
        </tbody>
      </table>
    </section>
  `,
  styles: [`.lbl { display: block; font-size: 10.5px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }`],
})
export class ForecastSettingsComponent {
  svc = inject(AccrualForecast);
  team = inject(TeamForecast);
  ui = inject(UiService);
  teams = TEAMS;
  chip = (on: boolean) => 'px-2 py-1 rounded-md border text-[11px] font-semibold ' + (on ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-surface-border text-ink-500 hover:bg-surface-subtle');

  field = FIELD;
  rules = RULES;
  types = CONTRACT_TYPES;
  months = MONTH_LONG;
  d: AccrualSettings = this.copy();
  private tick = signal(0);

  private copy(): AccrualSettings { const s = this.svc.settings(); return { ...s, contractTypes: [...s.contractTypes] }; }
  touch() { this.tick.update((n) => n + 1); }
  dirty = computed(() => { this.tick(); return JSON.stringify(this.d) !== JSON.stringify(this.svc.settings()); });
  problems = computed(() => {
    this.tick();
    const p: string[] = [];
    if (!this.d.contractTypes.length) p.push('Choose at least one contract type.');
    if (this.d.startMonth > this.d.endMonth) p.push('The forecast cannot end before it starts.');
    if (this.d.dayRule === 'Specific day of the month' && !(Number.isInteger(this.d.day) && this.d.day >= 1 && this.d.day <= 31)) p.push('The day of the month must be a whole number from 1 to 31.');
    if (!(this.d.varianceThreshold >= 0 && this.d.varianceThreshold <= 100)) p.push('The variance threshold must be between 0 and 100.');
    if (!(Number.isInteger(this.d.closeByDay) && this.d.closeByDay >= 1 && this.d.closeByDay <= 28)) p.push('The closing day must be a whole number from 1 to 28.');
    return p;
  });

  runNow() {
    if (!this.ui.requires('Configure Forecast')) return;
    this.ui.toast(this.svc.runSchedule(), 6000);
  }

  // ---- Team Forecast settings (applied straight away)
  canSee = (role: string, t: string) => (this.team.scope()[role] ?? TEAMS).includes(t);
  toggleScope(role: string, t: string) {
    if (!this.ui.requires('Configure Forecast')) return;
    const cur = this.team.scope()[role] ?? TEAMS;
    const next = TEAMS.filter((x) => (x === t ? !cur.includes(x) : cur.includes(x)));
    if (!next.length) { this.ui.toast('A role needs at least one team, or it would see an empty screen.', 5000); return; }
    this.team.setScope(role, next);
  }
  toggleGroupTeam(i: number, t: string) {
    if (!this.ui.requires('Configure Forecast')) return;
    this.team.saveGroups(this.team.groups().map((g, x) => (x === i ? { ...g, teams: g.teams.includes(t) ? g.teams.filter((y) => y !== t) : [...g.teams, t] } : g)));
  }
  renameGroup(i: number, name: string) {
    if (!this.ui.requires('Configure Forecast')) return;
    if (!name.trim()) { this.ui.toast('A group needs a name.', 4000); return; }
    this.team.saveGroups(this.team.groups().map((g, x) => (x === i ? { ...g, name: name.trim() } : g)));
  }
  removeGroup(i: number) {
    if (!this.ui.requires('Configure Forecast')) return;
    this.team.saveGroups(this.team.groups().filter((_, x) => x !== i));
  }
  addGroup(el: HTMLInputElement) {
    if (!this.ui.requires('Configure Forecast')) return;
    const n = el.value.trim();
    if (!n) return;
    if (this.team.groups().some((g) => g.name.toLowerCase() === n.toLowerCase())) { this.ui.toast('That group already exists.', 4000); return; }
    this.team.saveGroups([...this.team.groups(), { name: n, teams: [] }]);
    el.value = '';
  }

  toggleType(t: string) { this.d.contractTypes = this.d.contractTypes.includes(t) ? this.d.contractTypes.filter((x) => x !== t) : [...this.d.contractTypes, t]; this.touch(); }
  reset() { this.d = this.copy(); this.touch(); }
  save() {
    if (!this.ui.requires('Configure Forecast')) return;
    if (this.problems().length) { this.ui.toast(this.problems()[0], 5000); return; }
    this.svc.saveSettings({ ...this.d, contractTypes: [...this.d.contractTypes] });
    this.touch();
    this.ui.toast('Forecast settings saved. The change is in the audit log.');
  }
}
