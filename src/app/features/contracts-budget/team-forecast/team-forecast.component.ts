import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { RequiresDirective } from '../../../shared/directives/requires.directive';
import { UiService } from '../../../shared/services/ui.service';
import { CUR_MONTH, FY_LABEL, GROUPS, MONTH_LONG, MONTH_SHORT, TEAMS, TEAM_COMPS, TEAM_COMP_LABEL, TeamComp, TeamCriteria, TeamForecast } from '../../../core/services/forecast.service';

const FIELD = 'w-full px-2.5 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 focus:outline-none focus:border-brand-400';
const DEFAULTS = (): TeamCriteria => ({ year: FY_LABEL, mode: 'Full financial year', from: 0, to: CUR_MONTH, months: [CUR_MONTH], teams: [...TEAMS], comps: [...TEAM_COMPS], group: 'Team and Month', status: 'All' });
const chip = (on: boolean) => 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer select-none ' + (on ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-surface-border text-ink-600 hover:bg-surface-subtle');

/** SRS 2: the CRC team picks period, teams and cost components, checks the preview and exports the file for the Budget Team. */
@Component({
  selector: 'app-team-forecast',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, PageHeaderComponent, KpiCardComponent, StatusChipComponent, RequiresDirective],
  template: `
    <app-page-header
      title="Team Forecast"
      subtitle="Expected monthly cost by team and head count, prepared for the Budget Team. Pick what to include, check the preview, then export."
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Forecast' }, { label: 'Team Forecast' }]"
    >
      <button mat-stroked-button (click)="reset()"><mat-icon class="!text-base !mr-1">restart_alt</mat-icon>Reset filters</button>
      <button mat-stroked-button (click)="export('CSV')" appRequires="Export Team Forecast">CSV</button>
      <button mat-flat-button color="primary" (click)="export('Excel')" appRequires="Export Team Forecast"><mat-icon class="!text-base !mr-1">download</mat-icon>Export to Excel</button>
    </app-page-header>

    <section class="surface-card px-5 py-4 mb-4">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <label class="block"><span class="lbl">Financial year</span>
          <select [class]="field" (change)="set({ year: $any($event.target).value })">@for (y of svc.years; track y) { <option [value]="y" [selected]="y === c().year">{{ y }}</option> }</select></label>
        <label class="block"><span class="lbl">Forecast period</span>
          <select [class]="field" (change)="set({ mode: $any($event.target).value })">@for (m of modes; track m) { <option [value]="m" [selected]="m === c().mode">{{ m }}</option> }</select></label>
        @if (c().mode === 'Date range') {
          <label class="block"><span class="lbl">From month</span><select [class]="field" (change)="set({ from: +$any($event.target).value })">@for (m of long; track $index) { <option [value]="$index" [selected]="$index === c().from">{{ m }}</option> }</select></label>
          <label class="block"><span class="lbl">To month</span><select [class]="field" (change)="set({ to: +$any($event.target).value })">@for (m of long; track $index) { <option [value]="$index" [selected]="$index === c().to">{{ m }}</option> }</select></label>
        }
        <label class="block"><span class="lbl">Group by</span>
          <select [class]="field" (change)="set({ group: $any($event.target).value })">@for (g of groups; track g) { <option [value]="g" [selected]="g === c().group">{{ g }}</option> }</select></label>
        <label class="block"><span class="lbl">Forecast status</span>
          <select [class]="field" (change)="set({ status: $any($event.target).value })">@for (s of statuses; track s) { <option [value]="s" [selected]="s === c().status">{{ s === 'All' ? 'All statuses' : s }}</option> }</select></label>
      </div>

      @if (c().mode === 'Selected months') {
        <div class="mt-3"><span class="lbl">Months (pick any, they do not have to be next to each other)</span>
          <div class="flex flex-wrap gap-1.5 mt-1">
            @for (m of short; track $index) { <label [class]="chip(c().months.includes($index))"><input type="checkbox" class="hidden" [checked]="c().months.includes($index)" (change)="toggleMonth($index)">{{ m }}</label> }
          </div>
        </div>
      }

      <div class="mt-3"><div class="flex items-center gap-3"><span class="lbl !mb-0">Teams</span>
        <button class="text-xs font-semibold text-brand-700 hover:underline" (click)="pickTeams(true)">Select all</button>
        <button class="text-xs font-semibold text-ink-500 hover:underline" (click)="pickTeams(false)">Clear</button></div>
        <div class="flex flex-wrap gap-1.5 mt-1.5">
          @for (t of teams; track t) { <label [class]="chip(c().teams.includes(t))"><input type="checkbox" class="hidden" [checked]="c().teams.includes(t)" (change)="toggleTeam(t)">{{ t }}</label> }
        </div>
      </div>

      <div class="mt-3"><div class="flex items-center gap-3"><span class="lbl !mb-0">Cost components</span>
        <button class="text-xs font-semibold text-brand-700 hover:underline" (click)="pickComps()">Select all</button></div>
        <div class="flex flex-wrap gap-1.5 mt-1.5">
          @for (k of compKeys; track k) { <label [class]="chip(c().comps.includes(k))"><input type="checkbox" class="hidden" [checked]="c().comps.includes(k)" (change)="toggleComp(k)">{{ label[k] }}</label> }
        </div>
      </div>
    </section>

    @if (problems().length) {
      <div class="surface-card px-4 py-3 mb-4 flex items-start gap-3 border-l-4 !border-l-status-amber">
        <mat-icon class="text-status-amber">warning_amber</mat-icon>
        <div class="text-sm text-ink-700"><b>The export is not ready yet</b>@for (p of problems(); track p) { <div>• {{ p }}</div> }</div>
      </div>
    }

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      <app-kpi-card label="Teams selected" [value]="c().teams.length" icon="groups"></app-kpi-card>
      <app-kpi-card label="Months selected" [value]="monthCount()" icon="calendar_month"></app-kpi-card>
      <app-kpi-card label="Average head count" [value]="avgHc()" icon="person"></app-kpi-card>
      <app-kpi-card label="Selected total" [value]="view().total | number:'1.0-0'" unit="OMR" icon="payments" level="normal"></app-kpi-card>
    </div>

    <section class="surface-card overflow-hidden mb-4">
      <div class="px-5 pt-4 pb-3 flex items-center justify-between flex-wrap gap-2">
        <div><h3 class="text-[13.5px] font-bold text-ink-900">Preview</h3><p class="text-xs text-ink-400 mt-0.5">{{ summaryText() }}</p></div>
        <span class="text-xs text-ink-400">{{ view().rows.length }} row(s)</span>
      </div>
      <div class="overflow-auto max-h-[440px]">
        <table class="crc-table w-full text-sm">
          <thead><tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide sticky top-0">
            @for (col of view().columns; track col) { <th class="px-4 py-2 font-medium" [class.text-right]="isNum(col)">{{ col }}</th> }
          </tr></thead>
          <tbody>
            @for (r of view().rows; track $index) {
              <tr class="border-t border-surface-border">@for (col of view().columns; track col) { <td class="px-4 py-1.5" [class.text-right]="isNum(col)" [class.font-medium]="col === 'Team' || col === 'Cost Component'">{{ isNum(col) ? (r[col] | number:'1.0-0') : r[col] }}</td> }</tr>
            } @empty {
              <tr><td [attr.colspan]="view().columns.length" class="px-4 py-10 text-center text-sm text-ink-400">Nothing to show for these filters.</td></tr>
            }
          </tbody>
          @if (view().rows.length) {
            <tfoot class="sticky bottom-0 bg-white"><tr class="border-t-2 border-surface-border font-bold">
              @for (col of view().columns; track col; let i = $index) { <td class="px-4 py-2" [class.text-right]="isNum(col)">{{ i === 0 ? 'Total' : col === 'Head Count' || !isNum(col) ? '' : (colTotal(col) | number:'1.0-0') }}</td> }
            </tr></tfoot>
          }
        </table>
      </div>
      @if (view().rows.length) { <div class="px-5 py-2.5 border-t border-surface-border bg-surface-subtle text-xs text-ink-500">Grand total of the selected components: <b class="text-ink-800">{{ view().total | number:'1.0-0' }} OMR</b>. Head count is not added to any amount.{{ c().group === 'Team' ? ' Head count is the average across the selected months.' : '' }}</div> }
    </section>

    <section class="surface-card overflow-x-auto">
      <div class="px-5 pt-4 pb-3"><h3 class="text-[13.5px] font-bold text-ink-900">Export history</h3><p class="text-xs text-ink-400 mt-0.5">Who exported what, kept for audit</p></div>
      <table class="crc-table w-full text-sm">
        <thead><tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide"><th class="px-4 py-2 font-medium">When</th><th class="px-4 py-2 font-medium">By</th><th class="px-4 py-2 font-medium">Year</th><th class="px-4 py-2 font-medium">Months</th><th class="px-4 py-2 font-medium">Teams</th><th class="px-4 py-2 font-medium">Components</th><th class="px-4 py-2 font-medium">Grouped by</th><th class="px-4 py-2 font-medium">File</th><th class="px-4 py-2 font-medium">Status</th></tr></thead>
        <tbody>
          @for (e of svc.exports(); track e.id) {
            <tr class="border-t border-surface-border"><td class="px-4 py-2 text-ink-600 whitespace-nowrap">{{ e.at | date:'medium' }}</td><td class="px-4 py-2">{{ e.by }}</td><td class="px-4 py-2">{{ e.year }}</td><td class="px-4 py-2">{{ e.months }}</td><td class="px-4 py-2">{{ e.teams }}</td><td class="px-4 py-2">{{ e.comps }}</td><td class="px-4 py-2">{{ e.group }}</td><td class="px-4 py-2 text-ink-600">{{ e.file }}</td><td class="px-4 py-2"><app-status-chip [label]="e.status" level="normal"></app-status-chip></td></tr>
          } @empty { <tr><td colspan="9" class="px-4 py-8 text-center text-sm text-ink-400">Nothing has been exported yet.</td></tr> }
        </tbody>
      </table>
    </section>
  `,
  styles: [`.lbl { display: block; font-size: 10.5px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }`],
})
export class TeamForecastComponent {
  svc = inject(TeamForecast);
  private ui = inject(UiService);

  field = FIELD;
  chip = chip;
  groups = GROUPS;
  teams = TEAMS;
  compKeys = TEAM_COMPS;
  label = TEAM_COMP_LABEL;
  long = MONTH_LONG;
  short = MONTH_SHORT;
  modes: TeamCriteria['mode'][] = ['Full financial year', 'Date range', 'Selected months'];
  statuses = ['All', 'Approved', 'Draft'];

  c = signal<TeamCriteria>(DEFAULTS());
  set(p: Partial<TeamCriteria>) { this.c.update((x) => ({ ...x, ...p })); }
  reset() { this.c.set(DEFAULTS()); }
  pickTeams(all: boolean) { this.set({ teams: all ? [...TEAMS] : [] }); }
  pickComps() { this.set({ comps: [...TEAM_COMPS] }); }
  toggleTeam(t: string) { this.set({ teams: this.c().teams.includes(t) ? this.c().teams.filter((x) => x !== t) : [...this.c().teams, t] }); }
  toggleComp(k: TeamComp) { this.set({ comps: this.c().comps.includes(k) ? this.c().comps.filter((x) => x !== k) : [...this.c().comps, k] }); }
  toggleMonth(m: number) { this.set({ months: this.c().months.includes(m) ? this.c().months.filter((x) => x !== m) : [...this.c().months, m] }); }

  view = computed(() => this.svc.view(this.c()));
  problems = computed(() => this.svc.problems(this.c()));
  monthCount = computed(() => this.svc.months(this.c()).length);
  avgHc = computed(() => { const r = this.svc.filtered(this.c()); return r.length ? Math.round(r.reduce((s, x) => s + x.hc, 0) / new Set(r.map((x) => x.month)).size) : 0; });
  summaryText = computed(() => {
    const c = this.c(), m = this.svc.months(c);
    const period = c.mode === 'Full financial year' ? `full ${c.year}` : m.length ? m.map((i) => MONTH_SHORT[i]).join(', ') : 'no month';
    return `${c.year} · ${period} · ${c.teams.length === TEAMS.length ? 'all teams' : c.teams.length + ' team(s)'} · ${c.comps.length ? c.comps.map((k) => TEAM_COMP_LABEL[k]).join(', ') : 'no component'} · grouped by ${c.group}`;
  });

  isNum = (col: string) => col === 'Head Count' || col === 'Amount' || Object.values(TEAM_COMP_LABEL).includes(col);
  colTotal = (col: string) => this.view().rows.reduce((s, r) => s + (Number(r[col]) || 0), 0);

  export(format: 'Excel' | 'CSV') {
    if (!this.ui.requires('Export Team Forecast')) return;
    this.svc.export(this.c(), format); // shows the validation message itself when something is missing
  }
}
