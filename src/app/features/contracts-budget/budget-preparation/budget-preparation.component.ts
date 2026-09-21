import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { RequiresDirective } from '../../../shared/directives/requires.directive';
import { DIALOG_SIZE } from '../../../shared/dialog-sizes';
import { BudgetCycle, CycleStatus, MONTH_NAMES, OutsourcingLine, PettyLine } from '../../../core/services/budget-cycle.service';
import { UiService } from '../../../shared/services/ui.service';
import { CrcStore } from '../../../core/services/crc-store.service';
import { projectTotal, resourceCost } from '../../../core/services/project-data';
import { MonthlyBreakdownDialogComponent } from './monthly-breakdown-dialog.component';
import { SubmissionConfirmationDialogComponent } from './submission-confirmation-dialog.component';
import { BudgetConfig } from '../../../core/services/budget-config.service';
import { firstValueFrom } from 'rxjs';

const FLOW: CycleStatus[] = ['Not Started', 'Draft', 'Under Review', 'Ready for Submission', 'Submitted'];
const STATUS_CHIP: Record<CycleStatus, string> = { 'Not Started': 'neutral', Draft: 'neutral', 'Under Review': 'info', 'Ready for Submission': 'amber', Submitted: 'normal', Reopened: 'orange', Closed: 'neutral' };
const PHASE_CHIP: Record<string, string> = { 'Not started': 'neutral', Open: 'normal', 'Due soon': 'amber', Closed: 'red', Submitted: 'info' };
const num = (v: any) => Number(v ?? 0) || 0;

@Component({
  selector: 'app-budget-preparation',
  standalone: true,
  imports: [RequiresDirective, CommonModule, RouterModule, MatButtonModule, MatIconModule, MatTabsModule, PageHeaderComponent, KpiCardComponent],
  template: `
    <app-page-header
      title="Budget Preparation"
      [subtitle]="'Next financial year ' + c.settings().year + ' — start from last year\\'s values with the ' + c.settings().increasePct + '% increase, adjust, add projects and submit to the Budget Team'"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Budget' }, { label: 'Preparation' }]"
    >
      <span class="status-chip" [class]="'status-chip--' + statusChip()">{{ c.status() }}</span>
      <span class="status-chip" [class]="'status-chip--' + phaseChip()">{{ c.phase() }}</span>
      <button mat-stroked-button (click)="settingsForm()" appRequires="Manage Budget Cycle"><mat-icon class="!text-base !mr-1">tune</mat-icon>Cycle settings</button>
    </app-page-header>

    @if (locked()) { <div class="surface-card px-4 py-3 mb-4 flex items-center gap-3 border-l-4 !border-l-status-neutral"><mat-icon class="text-status-neutral">lock</mat-icon><div class="text-sm text-ink-700">{{ locked() }}</div></div> }

    <mat-tab-group [(selectedIndex)]="tab">
      <!-- ============ Overview (Screen 1) ============ -->
      <mat-tab label="Overview">
        <div class="pt-4 flex flex-col gap-4">
          <div class="surface-card px-4 py-3.5">
            <ol class="flex items-center gap-1 flex-wrap text-xs font-semibold list-none p-0 m-0">
              @for (s of flow(); track s; let last = $last) {
                <li class="flex items-center gap-1"><span class="px-2.5 py-1 rounded-full border" [class]="s === c.status() ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-surface-border text-ink-400'">{{ s }}</span>@if (!last) { <mat-icon class="!text-base text-ink-300">chevron_right</mat-icon> }</li>
              }
            </ol>
          </div>

          <div class="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <app-kpi-card label="Total proposed budget" [value]="t().total | number:'1.0-0'" unit="OMR" icon="edit_note"></app-kpi-card>
            <app-kpi-card label="Previous-year budget" [value]="t().previous | number:'1.0-0'" unit="OMR" icon="history"></app-kpi-card>
            <app-kpi-card label="Variance" [value]="(t().variance >= 0 ? '+' : '') + (t().variance | number:'1.0-0')" unit="OMR" [level]="t().variancePct > c.settings().warnPct ? 'amber' : 'normal'" [trend]="pct(t().variancePct)" icon="trending_up"></app-kpi-card>
            <app-kpi-card label="Total proposed head count" [value]="t().headCount" [trend]="'was ' + t().prevHeadCount" icon="groups"></app-kpi-card>
            <app-kpi-card label="Outsourcing total" [value]="t().outsourcing | number:'1.0-0'" unit="OMR" icon="support_agent"></app-kpi-card>
            <app-kpi-card label="Petty cash total" [value]="t().petty | number:'1.0-0'" unit="OMR" icon="payments"></app-kpi-card>
            <app-kpi-card label="Project total" [value]="t().projects | number:'1.0-0'" unit="OMR" icon="rocket_launch"></app-kpi-card>
            <div class="surface-card px-4 py-3">
              <div class="text-xs text-ink-400">Budget completion</div>
              <div class="text-lg font-extrabold text-ink-900 mt-0.5">{{ c.completion() }}%</div>
              <div class="h-1.5 rounded-full bg-surface-subtle mt-2 overflow-hidden"><div class="h-full rounded-full bg-brand-500" [style.width.%]="c.completion()"></div></div>
            </div>
          </div>

          <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
            <div class="surface-card px-5 py-4">
              <h3 class="text-[13.5px] font-bold text-ink-900">Cut-off</h3>
              <div class="text-2xl font-extrabold mt-2" [class]="c.daysLeft() < 0 ? 'text-status-red' : c.daysLeft() <= 7 ? 'text-status-amber' : 'text-ink-900'">{{ c.daysLeft() < 0 ? 'Passed' : c.daysLeft() + ' days left' }}</div>
              <div class="text-xs text-ink-400 mt-1">Cut-off date {{ c.settings().cutOff }} for {{ c.settings().departments.join(', ') }} · after it normal users cannot submit or change the budget; a cycle manager can reopen it with a reason.</div>
            </div>
            <div class="surface-card px-5 py-4">
              <h3 class="text-[13.5px] font-bold text-ink-900">Annual increase</h3>
              <div class="text-2xl font-extrabold text-ink-900 mt-2">{{ c.settings().increasePct }}%</div>
              <div class="text-xs text-ink-400 mt-1">Applied to last year's salary, incentive, overtime, OJT and petty cash. Head count starts at last year's. Change it in the cycle settings.</div>
            </div>
            <div class="surface-card px-5 py-4">
              <h3 class="text-[13.5px] font-bold text-ink-900">What to do next</h3>
              <div class="flex flex-col gap-2 mt-3">
                @if (c.status() === 'Not Started') { <button mat-flat-button color="primary" (click)="openCycle()" appRequires="Manage Budget Cycle"><mat-icon class="!text-base !mr-1">play_arrow</mat-icon>Create draft</button> }
                @else if (c.editable()) { <button mat-flat-button color="primary" (click)="tab = 1"><mat-icon class="!text-base !mr-1">edit_note</mat-icon>Continue preparation</button> }
                <button mat-stroked-button (click)="tab = 4"><mat-icon class="!text-base !mr-1">fact_check</mat-icon>Review budget</button>
                <button mat-stroked-button (click)="tab = 4" [disabled]="c.status() !== 'Ready for Submission'"><mat-icon class="!text-base !mr-1">send</mat-icon>Submit proposed budget</button>
              </div>
            </div>
          </div>
        </div>
      </mat-tab>

      <!-- ============ Outsourcing (Screen 2) ============ -->
      <mat-tab label="Outsourcing">
        <div class="pt-4 flex flex-col gap-3">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <p class="text-xs text-ink-500 max-w-3xl">Head count, salary, incentive, overtime and OJT per resource category, starting from last year plus {{ c.settings().increasePct }}%. Changes to head count or amounts need an adjustment reason.</p>
            <div class="flex items-center gap-2 flex-wrap">
              <button mat-stroked-button (click)="calculator()" [disabled]="!c.editable()"><mat-icon class="!text-base !mr-1">calculate</mat-icon>Additional resources</button>
              <button mat-stroked-button (click)="addCategory()" [disabled]="!c.editable()"><mat-icon class="!text-base !mr-1">add</mat-icon>Add resource category</button>
              <button mat-stroked-button (click)="reapply()" [disabled]="!c.editable()"><mat-icon class="!text-base !mr-1">restart_alt</mat-icon>Apply baseline</button>
            </div>
          </div>
          <div class="surface-card overflow-x-auto">
            <table class="crc-table w-full text-sm">
              <thead><tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide">
                <th class="px-3 py-2.5 font-medium">Vendor / Contract</th><th class="px-3 py-2.5 font-medium">Resource category</th>
                <th class="px-3 py-2.5 font-medium text-right">Previous HC</th><th class="px-3 py-2.5 font-medium text-right">Proposed HC</th>
                <th class="px-3 py-2.5 font-medium text-right">Previous salary</th><th class="px-3 py-2.5 font-medium text-right">Proposed salary</th>
                <th class="px-3 py-2.5 font-medium text-right">Incentive</th><th class="px-3 py-2.5 font-medium text-right">Overtime</th><th class="px-3 py-2.5 font-medium text-right">OJT</th>
                <th class="px-3 py-2.5 font-medium text-right">Annual total</th><th class="px-3 py-2.5 font-medium">Adjustment reason</th><th class="px-3 py-2.5 w-24"></th>
              </tr></thead>
              <tbody>
                @for (l of c.outsourcing(); track l.id) {
                  <tr class="border-t border-surface-border">
                    <td class="px-3 py-2"><div class="font-medium text-ink-700">{{ l.vendor }}</div><div class="text-xs text-ink-400">{{ l.contract || '—' }}</div></td>
                    <td class="px-3 py-2 text-ink-700">{{ l.category }}@if (l.prevHC === 0) { <span class="status-chip status-chip--info ml-1.5">New</span> }</td>
                    <td class="px-3 py-2 text-right text-ink-500">{{ l.prevHC }}</td>
                    <td class="px-3 py-2 text-right font-semibold" [class]="l.hc !== l.prevHC ? 'text-brand-700' : 'text-ink-900'">{{ l.hc }}</td>
                    <td class="px-3 py-2 text-right text-ink-500">{{ l.prevSalary | number:'1.0-2' }}</td>
                    <td class="px-3 py-2 text-right">{{ l.salary | number:'1.0-2' }}</td>
                    <td class="px-3 py-2 text-right">{{ l.incentive | number:'1.0-0' }}</td>
                    <td class="px-3 py-2 text-right">{{ l.overtime | number:'1.0-0' }}</td>
                    <td class="px-3 py-2 text-right">{{ l.ojt | number:'1.0-0' }}</td>
                    <td class="px-3 py-2 text-right font-semibold text-ink-900">{{ c.annual(l) | number:'1.0-0' }}<div class="text-[11px] font-normal" [class]="c.annual(l) >= c.prevAnnual(l) ? 'text-status-amber' : 'text-status-normal'">{{ pct(c.prevAnnual(l) ? (c.annual(l) - c.prevAnnual(l)) / c.prevAnnual(l) * 100 : 0) }}</div></td>
                    <td class="px-3 py-2 text-xs text-ink-500 max-w-[220px]"><span class="line-clamp-2">{{ l.reason || (c.reasonNeeded(l) ? '⚠ reason needed' : '—') }}</span></td>
                    <td class="px-3 py-2 text-right whitespace-nowrap">
                      <button class="w-7 h-7 rounded-md inline-flex items-center justify-center text-ink-400 hover:bg-surface-subtle hover:text-brand-600" title="Monthly breakdown" (click)="monthly(l)"><mat-icon class="!text-[17px]">calendar_view_month</mat-icon></button>
                      @if (c.editable()) {
                        <button class="w-7 h-7 rounded-md inline-flex items-center justify-center text-ink-400 hover:bg-surface-subtle hover:text-brand-600" title="Edit line" (click)="editLine(l)"><mat-icon class="!text-[17px]">edit</mat-icon></button>
                        @if (l.prevHC === 0) { <button class="w-7 h-7 rounded-md inline-flex items-center justify-center text-ink-400 hover:bg-red-50 hover:text-status-red" title="Remove" (click)="c.removeOutsourcing(l.id)"><mat-icon class="!text-[17px]">delete_outline</mat-icon></button> }
                      }
                    </td>
                  </tr>
                }
              </tbody>
              <tfoot><tr class="border-t-2 border-surface-border font-semibold"><td class="px-3 py-2.5" colspan="2">Outsourcing total</td><td class="px-3 py-2.5 text-right">{{ hcPrev() }}</td><td class="px-3 py-2.5 text-right">{{ hcNow() }}</td><td colspan="4"></td><td class="px-3 py-2.5 text-right text-brand-700">{{ t().outsourcing | number:'1.0-0' }}</td><td colspan="2" class="px-3 py-2.5 text-xs font-normal text-ink-400">Previous {{ t().prevOut | number:'1.0-0' }} OMR</td></tr></tfoot>
            </table>
          </div>
          <p class="text-xs text-ink-400">Salary is monthly per head, in OMR; incentive, overtime and OJT are yearly amounts. Annual total = head count × monthly salary × months + incentive + overtime + OJT.</p>
        </div>
      </mat-tab>

      <!-- ============ Petty cash (Screen 3) ============ -->
      <mat-tab label="Petty cash">
        <div class="pt-4 flex flex-col gap-3">
          <div class="surface-card px-4 py-3.5">
            <div class="flex items-center justify-between gap-3 flex-wrap"><h3 class="text-[13.5px] font-bold text-ink-900">Current-year petty cash against its allocation</h3><span class="status-chip" [class]="'status-chip--' + pettyChip()">{{ track().flag }}</span></div>
            <div class="grid grid-cols-2 md:grid-cols-6 gap-4 mt-3 text-sm">
              <div><div class="text-xs text-ink-400">Approved</div><div class="font-extrabold text-ink-900">{{ track().approved | number:'1.0-0' }}</div></div>
              <div><div class="text-xs text-ink-400">Spent</div><div class="font-extrabold text-ink-900">{{ track().spent | number:'1.0-0' }}</div></div>
              <div><div class="text-xs text-ink-400">Remaining</div><div class="font-extrabold" [class]="track().remaining < 0 ? 'text-status-red' : 'text-status-normal'">{{ track().remaining | number:'1.0-0' }}</div></div>
              <div><div class="text-xs text-ink-400">Forecast (full year)</div><div class="font-extrabold text-ink-900">{{ track().forecast | number:'1.0-0' }}</div></div>
              <div><div class="text-xs text-ink-400">Variance</div><div class="font-extrabold" [class]="track().variance > 0 ? 'text-status-red' : 'text-status-normal'">{{ (track().variance > 0 ? '+' : '') + (track().variance | number:'1.0-0') }}</div></div>
              <div><div class="text-xs text-ink-400">Utilization</div><div class="font-extrabold text-ink-900">{{ track().util }}%</div></div>
            </div>
          </div>
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <p class="text-xs text-ink-500">Next year's petty cash starts from last year's amount plus {{ c.settings().increasePct }}%. Adjust any category, with a reason.</p>
            <button mat-stroked-button (click)="addPetty()" [disabled]="!c.editable()"><mat-icon class="!text-base !mr-1">add</mat-icon>Add category</button>
          </div>
          <div class="surface-card overflow-x-auto">
            <table class="crc-table w-full text-sm">
              <thead><tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide"><th class="px-3 py-2.5 font-medium">Category</th><th class="px-3 py-2.5 font-medium text-right">Previous year</th><th class="px-3 py-2.5 font-medium text-right">Increase %</th><th class="px-3 py-2.5 font-medium text-right">System proposed</th><th class="px-3 py-2.5 font-medium text-right">User adjustment</th><th class="px-3 py-2.5 font-medium text-right">Final amount</th><th class="px-3 py-2.5 font-medium text-right">Monthly</th><th class="px-3 py-2.5 font-medium">Reason</th><th class="px-3 py-2.5 w-12"></th></tr></thead>
              <tbody>
                @for (l of c.petty(); track l.id) {
                  <tr class="border-t border-surface-border">
                    <td class="px-3 py-2 font-medium text-ink-700">{{ l.category }}</td><td class="px-3 py-2 text-right text-ink-500">{{ l.prev | number:'1.0-0' }}</td><td class="px-3 py-2 text-right text-ink-500">{{ c.settings().increasePct }}%</td>
                    <td class="px-3 py-2 text-right">{{ c.pettySystem(l) | number:'1.0-0' }}</td>
                    <td class="px-3 py-2 text-right" [class]="l.adjustment ? 'text-brand-700 font-semibold' : 'text-ink-400'">{{ l.adjustment ? ((l.adjustment > 0 ? '+' : '') + (l.adjustment | number:'1.0-0')) : '—' }}</td>
                    <td class="px-3 py-2 text-right font-semibold text-ink-900">{{ c.pettyFinal(l) | number:'1.0-0' }}</td>
                    <td class="px-3 py-2 text-right text-ink-500">{{ c.pettyFinal(l) / 12 | number:'1.0-0' }}</td>
                    <td class="px-3 py-2 text-xs text-ink-500 max-w-[220px]"><span class="line-clamp-2">{{ l.reason || '—' }}</span></td>
                    <td class="px-3 py-2 text-right">@if (c.editable()) { <button class="w-7 h-7 rounded-md inline-flex items-center justify-center text-ink-400 hover:bg-surface-subtle hover:text-brand-600" title="Edit" (click)="editPetty(l)"><mat-icon class="!text-[17px]">edit</mat-icon></button> }</td>
                  </tr>
                }
              </tbody>
              <tfoot><tr class="border-t-2 border-surface-border font-semibold"><td class="px-3 py-2.5">Petty cash total</td><td class="px-3 py-2.5 text-right">{{ t().prevPetty | number:'1.0-0' }}</td><td colspan="3"></td><td class="px-3 py-2.5 text-right text-brand-700">{{ t().petty | number:'1.0-0' }}</td><td class="px-3 py-2.5 text-right">{{ t().petty / 12 | number:'1.0-0' }}</td><td colspan="2"></td></tr></tfoot>
            </table>
          </div>
        </div>
      </mat-tab>

      <!-- ============ Projects ============ -->
      <mat-tab [label]="'Projects (' + c.projectsIncluded().length + ')'">
        <div class="pt-4 flex flex-col gap-3">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <p class="text-xs text-ink-500 max-w-3xl">Projects the Budget Owner included, with their resource cost. Line managers and project managers add projects on <a class="text-brand-600 font-medium" routerLink="/contracts-budget/projects">Project Requests</a>.</p>
            <a mat-stroked-button routerLink="/contracts-budget/projects"><mat-icon class="!text-base !mr-1">rocket_launch</mat-icon>Open Project Requests</a>
          </div>
          @if (c.projectsPending().length) {
            <div class="surface-card px-4 py-3 flex items-start gap-3 border-l-4 !border-l-status-amber"><mat-icon class="text-status-amber">pending_actions</mat-icon><div class="text-sm text-ink-700"><b>{{ c.projectsPending().length }} not in the budget yet:</b> {{ pendingNames() }}.</div></div>
          }
          <div class="surface-card overflow-x-auto">
            <table class="crc-table w-full text-sm">
              <thead><tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide"><th class="px-3 py-2.5 font-medium">Project</th><th class="px-3 py-2.5 font-medium">Project status</th><th class="px-3 py-2.5 font-medium">Priority</th><th class="px-3 py-2.5 font-medium text-right">Head count</th><th class="px-3 py-2.5 font-medium text-right">Estimated cost</th><th class="px-3 py-2.5 font-medium text-right">Resource cost</th><th class="px-3 py-2.5 font-medium text-right">Total</th></tr></thead>
              <tbody>
                @for (p of c.projectsIncluded(); track p.id) {
                  <tr class="border-t border-surface-border"><td class="px-3 py-2 font-medium text-ink-700">{{ p.name }}</td><td class="px-3 py-2 text-ink-500">{{ p.projectStatus }}</td><td class="px-3 py-2"><span class="status-chip" [class]="p.priority === 'High' ? 'status-chip--red' : p.priority === 'Medium' ? 'status-chip--amber' : 'status-chip--neutral'">{{ p.priority }}</span></td><td class="px-3 py-2 text-right">{{ p.headCount }}</td><td class="px-3 py-2 text-right">{{ p.budget | number:'1.0-0' }}</td><td class="px-3 py-2 text-right">{{ rc(p) | number:'1.0-0' }}</td><td class="px-3 py-2 text-right font-semibold">{{ pt(p) | number:'1.0-0' }}</td></tr>
                } @empty { <tr><td colspan="7" class="px-4 py-8 text-center text-sm text-ink-400">No project is included yet.</td></tr> }
              </tbody>
              <tfoot><tr class="border-t-2 border-surface-border font-semibold"><td class="px-3 py-2.5" colspan="6">Project total (last year {{ t().prevProjects | number:'1.0-0' }})</td><td class="px-3 py-2.5 text-right text-brand-700">{{ t().projects | number:'1.0-0' }}</td></tr></tfoot>
            </table>
          </div>
        </div>
      </mat-tab>

      <!-- ============ Review & submit (Screens 6 and 7) ============ -->
      <mat-tab label="Review & submit">
        <div class="pt-4 grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
          <div class="xl:col-span-2 flex flex-col gap-4">
            <div class="surface-card px-5 py-4">
              <h3 class="text-[13.5px] font-bold text-ink-900">Budget summary</h3>
              <table class="crc-table w-full mt-3 text-sm"><tbody>
                @for (r of summaryRows(); track r[0]) {
                  <tr class="border-t border-surface-border" [class.font-semibold]="r[3]"><td class="px-3 py-2" [class]="r[3] ? 'text-ink-900' : 'text-ink-700'">{{ r[0] }}</td><td class="px-3 py-2 text-right text-ink-500">{{ r[1] | number:'1.0-0' }}</td><td class="px-3 py-2 text-right" [class]="r[3] ? 'text-brand-700' : 'text-ink-900'">{{ r[2] | number:'1.0-0' }}</td></tr>
                }
              </tbody><thead><tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide"><th class="px-3 py-2 font-medium">Category (OMR)</th><th class="px-3 py-2 font-medium text-right">Previous year</th><th class="px-3 py-2 font-medium text-right">Proposed</th></tr></thead></table>
            </div>

            <div class="surface-card px-5 py-4">
              <h3 class="text-[13.5px] font-bold text-ink-900">Validation</h3>
              @if (!c.issues().length) { <div class="flex items-center gap-2 mt-3 text-sm text-status-normal"><mat-icon>check_circle</mat-icon>Everything is complete. The budget can be submitted.</div> }
              <ul class="mt-2 flex flex-col gap-1.5 list-none p-0 m-0">
                @for (i of c.issues(); track $index) { <li class="flex items-start gap-2 text-sm text-ink-700"><mat-icon class="!text-lg shrink-0" [class]="i.level === 'error' ? 'text-status-red' : 'text-status-amber'">{{ i.level === 'error' ? 'error' : 'warning' }}</mat-icon><span>{{ i.text }}</span></li> }
              </ul>
            </div>

            @if (latest(); as s) {
              <div class="surface-card px-5 py-4">
                <div class="flex items-center gap-2"><mat-icon class="text-status-normal">task_alt</mat-icon><h3 class="text-[13.5px] font-bold text-ink-900">Submission confirmation</h3><span class="status-chip" [class]="s.emailStatus === 'Sent' ? 'status-chip--normal' : 'status-chip--red'">Email {{ s.emailStatus }}</span></div>
                <dl class="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 mt-3 text-sm">
                  <div><dt class="text-xs text-ink-400">Submission reference</dt><dd class="font-medium text-ink-900">{{ s.reference }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Financial year</dt><dd class="font-medium text-ink-900">{{ c.settings().year }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Total proposed budget</dt><dd class="font-medium text-ink-900">{{ s.total | number:'1.0-0' }} OMR</dd></div>
                  <div><dt class="text-xs text-ink-400">Submitted</dt><dd class="font-medium text-ink-900">{{ s.at | date:'medium' }} by {{ s.by }}</dd></div>
                  <div class="md:col-span-2"><dt class="text-xs text-ink-400">Email recipients</dt><dd class="font-medium text-ink-900">{{ s.recipients || '—' }}</dd></div>
                  <div class="md:col-span-3"><dt class="text-xs text-ink-400">Generated budget sheet</dt><dd class="font-medium text-ink-900">{{ s.fileName }}</dd></div>
                </dl>
                @if (s.emailError) { <div class="text-sm text-status-red mt-3">{{ s.emailError }}</div> }
                <div class="flex items-center gap-2 mt-4 flex-wrap">
                  <button mat-stroked-button (click)="excel()"><mat-icon class="!text-base !mr-1">download</mat-icon>Download budget sheet</button>
                  @if (s.emailStatus === 'Failed' || c.canManage()) { <button mat-stroked-button (click)="resend(s.reference)" appRequires="Manage Budget Cycle"><mat-icon class="!text-base !mr-1">forward_to_inbox</mat-icon>Resend email</button> }
                </div>
                <div class="mt-4 rounded-lg bg-surface-subtle border border-surface-border px-4 py-3 text-xs text-ink-600 leading-relaxed">
                  <div class="font-semibold text-ink-900">Email to the Budget Team</div>
                  <div>Subject: CRC proposed budget {{ c.settings().year }} — {{ s.total | number:'1.0-0' }} OMR ({{ s.reference }})</div>
                  <div class="mt-1">Financial year {{ c.settings().year }} · Customer Care (CRC) · submitted {{ s.at | date:'mediumDate' }} by {{ s.by }} · total {{ s.total | number:'1.0-0' }} OMR · attachment {{ s.fileName }} · view the budget in CRC.</div>
                </div>
              </div>
            }
          </div>

          <div class="flex flex-col gap-4">
            <div class="surface-card px-5 py-4">
              <h3 class="text-[13.5px] font-bold text-ink-900">Move the budget forward</h3>
              <div class="flex flex-col gap-2 mt-3">
                @switch (c.status()) {
                  @case ('Not Started') { <button mat-flat-button color="primary" (click)="openCycle()" appRequires="Manage Budget Cycle"><mat-icon class="!text-base !mr-1">play_arrow</mat-icon>Open the budget cycle</button> }
                  @case ('Draft') { <button mat-flat-button color="primary" (click)="c.sendToReview()" [disabled]="!c.editable()"><mat-icon class="!text-base !mr-1">visibility</mat-icon>Send for internal review</button> }
                  @case ('Reopened') { <button mat-flat-button color="primary" (click)="c.sendToReview()" [disabled]="!c.editable()"><mat-icon class="!text-base !mr-1">visibility</mat-icon>Send for internal review</button> }
                  @case ('Under Review') {
                    <button mat-flat-button color="primary" (click)="ready()" [disabled]="!c.editable()"><mat-icon class="!text-base !mr-1">done_all</mat-icon>Mark ready for submission</button>
                    <button mat-stroked-button (click)="c.backToDraft()" [disabled]="!c.editable()">Back to draft</button>
                  }
                  @case ('Ready for Submission') {
                    <label class="flex items-start gap-2 text-sm text-ink-700 cursor-pointer"><input type="checkbox" class="mt-1 accent-[#ea6e00]" [checked]="confirmed()" (change)="confirmed.set(!confirmed())" /><span>I confirm the budget is complete and can be sent to the Budget Team.</span></label>
                    <button mat-flat-button color="primary" (click)="submit()" [disabled]="!confirmed() || !c.editable()"><mat-icon class="!text-base !mr-1">send</mat-icon>Submit proposed budget</button>
                    <button mat-stroked-button (click)="c.backToDraft()" [disabled]="!c.editable()">Back to draft</button>
                  }
                  @case ('Submitted') {
                    <button mat-stroked-button (click)="reopen()" appRequires="Manage Budget Cycle"><mat-icon class="!text-base !mr-1">lock_open</mat-icon>Reopen the budget</button>
                    <button mat-stroked-button (click)="closeCycle()" appRequires="Manage Budget Cycle"><mat-icon class="!text-base !mr-1">event_available</mat-icon>Close the cycle</button>
                  }
                  @case ('Closed') { <div class="text-sm text-ink-500">The budget cycle is closed and no further changes are permitted.</div> }
                }
              </div>
              <p class="text-xs text-ink-400 mt-3 leading-relaxed">After submitting, the budget is locked, a versioned budget sheet is generated and emailed to the Budget Team. Reopening needs a reason and creates a new version when it is submitted again.</p>
            </div>

            <div class="surface-card px-5 py-4">
              <h3 class="text-[13.5px] font-bold text-ink-900">Budget sheet</h3>
              <p class="text-xs text-ink-400 mt-1">Download the consolidated sheet at any time. Excel has a summary plus one sheet each for outsourcing, petty cash and projects.</p>
              <div class="flex items-center gap-2 mt-3"><button mat-stroked-button (click)="excel()"><mat-icon class="!text-base !mr-1">table_view</mat-icon>Excel</button><button mat-stroked-button (click)="pdf()"><mat-icon class="!text-base !mr-1">picture_as_pdf</mat-icon>PDF</button></div>
            </div>

            <div class="surface-card px-5 py-4">
              <h3 class="text-[13.5px] font-bold text-ink-900">Submitted versions</h3>
              @for (s of c.submissions(); track s.reference) { <div class="flex items-center justify-between gap-2 text-sm mt-2"><button class="text-ink-700 font-medium hover:text-brand-700 hover:underline text-left" (click)="confirmation(s.reference)" title="Open the submission confirmation">v{{ s.version }} · {{ s.reference }}</button><span class="text-xs text-ink-400">{{ s.total | number:'1.0-0' }} OMR · {{ s.at | date:'shortDate' }}</span></div> } @empty { <div class="text-xs text-ink-400 mt-2">Nothing submitted yet.</div> }
              @for (r of c.reopenLog(); track r.at) { <div class="text-xs text-ink-500 mt-2 border-t border-surface-border pt-2">Reopened {{ r.at | date:'short' }} by {{ r.by }} — {{ r.reason }}</div> }
            </div>
          </div>
        </div>
      </mat-tab>
    </mat-tab-group>
  `,
})
export class BudgetPreparationComponent {
  c = inject(BudgetCycle);
  private cfg = inject(BudgetConfig);
  private ui = inject(UiService);
  private store = inject(CrcStore);
  private dialog = inject(MatDialog);

  tab = 0;
  confirmed = signal(false);

  t = this.c.totals;
  track = this.c.pettyTracking;
  flow = computed(() => (this.c.status() === 'Reopened' || this.c.status() === 'Closed' ? [...FLOW.slice(0, 4), this.c.status()] : FLOW));
  statusChip = computed(() => STATUS_CHIP[this.c.status()]);
  phaseChip = computed(() => PHASE_CHIP[this.c.phase()]);
  pettyChip = computed(() => ({ 'Within allocation': 'normal', 'Expected to exceed': 'amber', Reached: 'orange', Exceeded: 'red' } as Record<string, string>)[this.track().flag]);
  latest = computed(() => this.c.submissions()[0]);
  hcPrev = computed(() => this.c.outsourcing().reduce((s, l) => s + l.prevHC, 0));
  hcNow = computed(() => this.c.outsourcing().reduce((s, l) => s + l.hc, 0));
  pendingNames = computed(() => this.c.projectsPending().map((p) => `${p.name} (${p.status})`).join(', '));
  locked = computed(() => {
    const s = this.c.status();
    if (s === 'Submitted' || s === 'Closed') return `The budget is ${s.toLowerCase()} and read-only.${s === 'Submitted' ? ' A cycle manager can reopen it with a reason.' : ''}`;
    if (this.c.status() !== 'Not Started' && this.c.daysLeft() < 0 && !this.c.canManage()) return 'The cut-off date has passed. Normal users can no longer change or submit the budget; a cycle manager can reopen it.';
    if (!this.c.canPrepare() && !this.c.canManage()) return `Your role (${this.store.currentRole()}) can view the budget but not change it.`;
    return '';
  });
  summaryRows = computed<Array<[string, number, number, boolean]>>(() => {
    const x = this.t(), o = this.c.outsourcing();
    const prev = (f: (l: (typeof o)[number]) => number) => Math.round(o.reduce((s, l) => s + f(l), 0));
    return [['Outsourcing', x.prevOut, x.outsourcing, false], ['   Salaries', prev((l) => l.prevHC * l.prevSalary * 12), x.salaries, false], ['   Incentives', prev((l) => l.prevIncentive), x.incentives, false], ['   Overtime', prev((l) => l.prevOvertime), x.overtime, false], ['   OJT', prev((l) => l.prevOjt), x.ojt, false], ['Petty cash', x.prevPetty, x.petty, false], ['Projects', x.prevProjects, x.projects, false], ['Total budget', x.previous, x.total, true]];
  });

  pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
  rc = resourceCost;
  pt = projectTotal;

  private fail(msg: string | null | undefined) { if (msg) { this.ui.toast(msg, 5500); return true; } return false; }

  openCycle() { this.c.openCycle(); this.ui.toast('Budget cycle opened: last year\'s values copied and the increase applied.'); }

  async settingsForm() {
    if (!this.ui.requires('Manage Budget Cycle')) return;
    const s = this.c.settings();
    const v = await this.ui.form({
      title: 'Budget cycle settings', subtitle: `${s.year} — cut-off, annual increase and who receives the budget`, icon: 'tune', submitLabel: 'Save settings', values: { ...s },
      fields: [
        { key: 'cycleName', label: 'Budget cycle', required: true },
        { key: 'departments', label: 'Departments or teams this cut-off applies to', type: 'multiselect', options: this.cfg.departments(), required: true },
        { key: 'increasePct', label: 'Annual increase (%)', type: 'number', min: 0, max: 100, required: true, hint: 'The default is 5%. The original proposal said 3%.' },
        { key: 'cutOff', label: 'Cut-off date', type: 'date', required: true },
        { key: 'warnPct', label: 'Warn when the budget is above last year by (%)', type: 'number', min: 0 },
        { key: 'to', label: 'Submission recipient — Budget Team (To)', placeholder: 'name@omantel.om, another@omantel.om' },
        { key: 'cc', label: 'CC' },
        { key: 'bcc', label: 'BCC', hint: 'Only if the organisation approves blind copies.' },
      ],
    });
    if (!v) return;
    const pct = num(v['increasePct']);
    const changed = pct !== s.increasePct;
    this.c.saveSettings({ cycleName: v['cycleName'], departments: v['departments'], increasePct: pct, cutOff: v['cutOff'], warnPct: num(v['warnPct']), to: v['to'] ?? '', cc: v['cc'] ?? '', bcc: v['bcc'] ?? '' });
    if (changed && this.c.editable()) {
      const apply = await this.ui.confirm({ title: 'Apply the new increase?', message: `Last year's values × (1 + ${pct}%) replace the current baseline. Manual adjustments and their reasons will be cleared.`, confirmLabel: 'Apply', icon: 'restart_alt' });
      if (apply) this.c.applyBaseline();
    }
    this.ui.toast('Cycle settings saved.');
  }

  async reapply() {
    const ok = await this.ui.confirm({ title: 'Apply the baseline again?', message: `Every line goes back to last year's value × (1 + ${this.c.settings().increasePct}%). Adjustments and reasons will be cleared.`, confirmLabel: 'Apply baseline', icon: 'restart_alt' });
    if (!ok) return;
    this.c.applyBaseline();
    this.ui.toast('Baseline applied.');
  }

  async editLine(l: OutsourcingLine) {
    const v = await this.ui.form({
      title: 'Edit resource category', subtitle: `${l.vendor} · ${l.category} — last year ${l.prevHC} head(s) at ${l.prevSalary.toLocaleString()} OMR a month`, icon: 'edit', submitLabel: 'Save line',
      values: { hc: l.hc, salary: l.salary, incentive: l.incentive, overtime: l.overtime, ojt: l.ojt, other: l.other, reason: l.reason },
      fields: [
        { key: 'hc', label: 'Proposed head count', type: 'number', min: 0, required: true },
        { key: 'salary', label: 'Monthly salary per head (OMR)', type: 'number', min: 0, required: true },
        { key: 'incentive', label: 'Incentive per year (OMR)', type: 'number', min: 0 },
        { key: 'overtime', label: 'Overtime per year (OMR)', type: 'number', min: 0 },
        { key: 'ojt', label: 'OJT per year (OMR)', type: 'number', min: 0 },
        { key: 'other', label: 'Other cost (OMR)', type: 'number', min: 0 },
        { key: 'reason', label: 'Adjustment reason', type: 'textarea', hint: 'Required when head count changes, or the amount is below last year or above the calculated amount.' },
      ],
    });
    if (!v) return;
    if (!this.fail(this.c.editOutsourcing(l.id, { hc: num(v['hc']), salary: num(v['salary']), incentive: num(v['incentive']), overtime: num(v['overtime']), ojt: num(v['ojt']), other: num(v['other']), reason: v['reason'] ?? '' }))) this.ui.toast('Line updated.');
  }

  async monthly(l: OutsourcingLine) {
    const fresh = this.c.outsourcing().find((x) => x.id === l.id) ?? l;
    const res = await new Promise<string | undefined>((resolve) => this.dialog.open(MonthlyBreakdownDialogComponent, { data: { line: fresh, editable: this.c.editable() }, panelClass: 'app-dialog-panel', autoFocus: false, ...DIALOG_SIZE.wide }).afterClosed().subscribe(resolve));
    if (res !== 'edit') return;
    const values: Record<string, any> = { reason: fresh.reason };
    MONTH_NAMES.forEach((_, i) => (values['m' + i] = fresh.monthlyHC[i]));
    const v = await this.ui.form({
      title: 'Head count by month', subtitle: `${fresh.category} — recruitment, resignation, replacement or expansion during the year`, icon: 'calendar_view_month', submitLabel: 'Save head count', values,
      fields: [...MONTH_NAMES.map((m, i) => ({ key: 'm' + i, label: m, type: 'number' as const, min: 0, required: true })), { key: 'reason', label: 'Reason', type: 'textarea' as const, required: true }],
    });
    if (!v) return;
    if (!this.fail(this.c.setMonthlyHC(fresh.id, MONTH_NAMES.map((_, i) => num(v['m' + i])), v['reason']))) this.ui.toast('Monthly head count updated.');
  }

  async addCategory() {
    const v = await this.ui.form({
      title: 'Add a resource category', subtitle: 'A new position or outsourcing arrangement in next year\'s budget', icon: 'group_add', submitLabel: 'Add category', values: { vendor: 'Infoline LLC', contract: '2025-013T-00-01' },
      fields: [
        { key: 'vendor', label: 'Vendor', required: true }, { key: 'contract', label: 'Contract' }, { key: 'category', label: 'Resource category or position', type: 'select', options: this.cfg.resourceCategories(), required: true, hint: 'The list is set in Budget Settings.' },
        { key: 'hc', label: 'Head count', type: 'number', min: 0, required: true }, { key: 'salary', label: 'Monthly salary per head (OMR)', type: 'number', min: 0, required: true },
        { key: 'incentive', label: 'Incentive per year (OMR)', type: 'number', min: 0 }, { key: 'overtime', label: 'Overtime per year (OMR)', type: 'number', min: 0 }, { key: 'ojt', label: 'OJT per year (OMR)', type: 'number', min: 0 },
        { key: 'reason', label: 'Reason', type: 'textarea', required: true },
      ],
    });
    if (!v) return;
    if (!this.fail(this.c.addOutsourcing({ vendor: v['vendor'], contract: v['contract'] ?? '', category: v['category'], hc: num(v['hc']), salary: num(v['salary']), incentive: num(v['incentive']), overtime: num(v['overtime']), ojt: num(v['ojt']), reason: v['reason'] }))) this.ui.toast('Resource category added.');
  }

  /** BR-OUT-010: estimate the effect of hiring extra resources, then optionally add them. */
  async calculator() {
    const lines = this.c.outsourcing();
    const v = await this.ui.form({
      title: 'Additional resources calculator', subtitle: 'See what hiring more resources would cost before adding them', icon: 'calculate', submitLabel: 'Calculate', values: { line: lines[0]?.id, count: 1, fromMonth: String(new Date().getMonth() + 2 > 12 ? 1 : new Date().getMonth() + 2), months: 12, salary: lines[0]?.salary },
      fields: [
        { key: 'line', label: 'Add to', type: 'select', options: lines.map((l) => ({ value: l.id, label: `${l.vendor} · ${l.category}` })), required: true },
        { key: 'count', label: 'Number of additional resources', type: 'number', min: 1, required: true },
        { key: 'fromMonth', label: 'Expected hiring month', type: 'select', options: MONTH_NAMES.map((m, i) => ({ value: String(i + 1), label: m })), required: true },
        { key: 'months', label: 'Contract duration (months)', type: 'number', min: 1, max: 12, required: true },
        { key: 'salary', label: 'Monthly salary per head (OMR)', type: 'number', min: 0, required: true },
        { key: 'incentive', label: 'Extra incentive (OMR)', type: 'number', min: 0 }, { key: 'overtime', label: 'Extra overtime (OMR)', type: 'number', min: 0 }, { key: 'other', label: 'Other applicable costs (OMR)', type: 'number', min: 0 },
      ],
    });
    if (!v) return;
    const inp = { count: num(v['count']), fromMonth: num(v['fromMonth']), months: num(v['months']), salary: num(v['salary']), incentive: num(v['incentive']), overtime: num(v['overtime']), other: num(v['other']) };
    const r = this.c.calcResources(inp);
    const ok = await this.ui.confirm({
      title: 'Effect of the additional resources', icon: 'calculate', confirmLabel: 'Add to the budget',
      message: `Additional monthly cost: ${r.monthly.toLocaleString()} OMR\nRemaining annual cost (${r.months} months): ${r.remaining.toLocaleString()} OMR\nCurrent proposed budget: ${r.current.toLocaleString()} OMR\nRevised annual budget: ${r.revised.toLocaleString()} OMR\nDifference: +${r.difference.toLocaleString()} OMR`,
    });
    if (!ok) return;
    if (!this.fail(this.c.addResources(v['line'], { count: inp.count, fromMonth: inp.fromMonth, months: inp.months, incentive: inp.incentive, overtime: inp.overtime, other: inp.other, reason: `${inp.count} additional resource(s) from ${MONTH_NAMES[inp.fromMonth - 1]}` }))) this.ui.toast('Additional resources added to the budget.');
  }

  async editPetty(l: PettyLine) {
    const v = await this.ui.form({
      title: 'Petty cash amount', subtitle: `${l.category} — last year ${l.prev.toLocaleString()} OMR, system proposal ${this.c.pettySystem(l).toLocaleString()} OMR`, icon: 'payments', submitLabel: 'Save', values: { final: this.c.pettyFinal(l), reason: l.reason },
      fields: [{ key: 'final', label: 'Final annual amount (OMR)', type: 'number', min: 0, required: true }, { key: 'reason', label: 'Reason for the adjustment', type: 'textarea', hint: 'Required when the amount differs from the system proposal.' }],
    });
    if (!v) return;
    if (!this.fail(this.c.setPettyFinal(l.id, num(v['final']), v['reason'] ?? ''))) this.ui.toast('Petty cash updated.');
  }

  async addPetty() {
    const v = await this.ui.form({
      title: 'Add a petty cash category', icon: 'add_card', submitLabel: 'Add category',
      fields: [{ key: 'category', label: 'Expense category', type: 'select', options: this.cfg.pettyItems().filter((i) => !this.c.petty().some((l) => l.category === i)), required: true, hint: 'The list is set in Budget Settings.' }, { key: 'prev', label: 'Last year amount (OMR)', type: 'number', min: 0 }, { key: 'final', label: 'Proposed annual amount (OMR)', type: 'number', min: 0, required: true }, { key: 'reason', label: 'Reason', type: 'textarea', required: true }],
    });
    if (!v) return;
    if (!this.fail(this.c.addPetty(v['category'], num(v['prev']), num(v['final']), v['reason']))) this.ui.toast('Petty cash category added.');
  }

  ready() { if (!this.fail(this.c.markReady())) this.ui.toast('Marked ready for submission.'); else this.tab = 4; }

  async submit() {
    const ok = await this.ui.confirm({ title: 'Submit the proposed budget?', message: `${Math.round(this.t().total).toLocaleString()} OMR for ${this.c.settings().year} will be locked, a budget sheet generated and emailed to the Budget Team.`, confirmLabel: 'Submit', icon: 'send' });
    if (!ok) return;
    const r = this.c.submit();
    if (r.error) { this.ui.toast(r.error, 5500); return; }
    this.confirmed.set(false);
    this.excel(false);
    await this.confirmation(r.submission!.reference);
  }

  /** Screen 7: submission confirmation with the sheet download and, if permitted, resend. */
  async confirmation(reference: string) {
    const s = this.c.submissions().find((x) => x.reference === reference);
    if (!s) return;
    const canResend = this.store.can('Manage Budget Cycle') && (s.emailStatus === 'Failed' || this.c.canManage());
    const dlg = this.dialog.open(SubmissionConfirmationDialogComponent, { data: { submission: s, year: this.c.settings().year, canResend }, panelClass: 'app-dialog-panel', autoFocus: false, ...DIALOG_SIZE.form });
    const act = await firstValueFrom(dlg.afterClosed());
    if (act === 'download') this.excel();
    else if (act === 'resend') { this.resend(reference); await this.confirmation(reference); }
  }

  async reopen() {
    if (!this.ui.requires('Manage Budget Cycle')) return;
    const v = await this.ui.form({ title: 'Reopen the budget', subtitle: 'It becomes editable again; the next submission creates a new version', icon: 'lock_open', submitLabel: 'Reopen', fields: [{ key: 'reason', label: 'Reason', type: 'textarea', required: true }] });
    if (!v) return;
    this.c.reopen(v['reason']);
    this.ui.toast('Budget reopened.');
  }

  async closeCycle() {
    if (!this.ui.requires('Manage Budget Cycle')) return;
    const ok = await this.ui.confirm({ title: 'Close the budget cycle?', message: 'No further changes will be permitted.', confirmLabel: 'Close cycle', danger: true });
    if (ok) this.c.close();
  }

  resend(ref: string) {
    if (!this.ui.requires('Manage Budget Cycle')) return;
    const err = this.c.resendEmail(ref);
    this.ui.toast(err ?? 'Email sent again. No new submission was created.', 5500);
  }

  excel(toast = true) {
    const sh = this.c.sheet();
    this.ui.xlsxSheets(`CRC-Budget-${this.c.settings().year}`, [{ name: 'Summary', rows: sh.summary }, { name: 'Outsourcing', rows: sh.outsourcing }, { name: 'Petty cash', rows: sh.petty }, { name: 'Projects', rows: sh.projects }], toast);
  }

  pdf() { this.ui.pdf(`CRC-Budget-${this.c.settings().year}.pdf`, `CRC proposed budget ${this.c.settings().year}`, this.c.sheetLines()); }
}
