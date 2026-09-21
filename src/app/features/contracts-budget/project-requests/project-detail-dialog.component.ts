import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { StatusLevel } from '../../../core/models/status';
import { ProjectRequest, projectTotal, resourceCost } from '../../../core/services/project-data';

export const PROJECT_LEVEL: Record<string, StatusLevel> = { Draft: 'neutral', Submitted: 'amber', 'Returned for Modification': 'orange', 'Included in Budget': 'normal', 'Excluded from Budget': 'red', Cancelled: 'neutral' };
export const PRIORITY_LEVEL: Record<string, StatusLevel> = { High: 'red', Medium: 'amber', Low: 'neutral' };
const EVENT_ICON: Record<string, string> = { Created: 'add_circle', Edited: 'edit', Submitted: 'send', Resubmitted: 'send', Included: 'check_circle', Returned: 'undo', Excluded: 'block', Cancelled: 'delete', Copied: 'content_copy' };

/** Everything about one project request: what it is, why it is needed, the head count, the decision and the full history. */
@Component({
  selector: 'app-project-detail-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule, StatusChipComponent],
  template: `
    <div class="w-full">
      <div class="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-surface-border">
        <div class="min-w-0">
          <h2 class="text-base font-bold text-ink-900">{{ p.name }}</h2>
          <p class="text-xs text-ink-400 mt-0.5">{{ p.financialYear }} · {{ p.projectStatus }} · requested by {{ p.requestedBy }}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <app-status-chip [label]="p.priority + ' priority'" [level]="priorityLevel"></app-status-chip>
          <app-status-chip [label]="p.status" [level]="level"></app-status-chip>
          <button class="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:bg-surface-subtle hover:text-ink-700" (click)="ref.close()"><mat-icon>close</mat-icon></button>
        </div>
      </div>

      <div class="px-6 py-5 max-h-[72vh] overflow-y-auto">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
          <div class="md:col-span-2">
            <div class="text-[11px] font-bold uppercase tracking-wide text-ink-400">Scope of work</div>
            <p class="text-sm text-ink-900 mt-1">{{ p.scope }}</p>
            <div class="text-[11px] font-bold uppercase tracking-wide text-ink-400 mt-4">Justification</div>
            <p class="text-sm text-ink-700 mt-1 leading-relaxed">{{ p.reason }}</p>
            @if (p.costBreakdown) { <div class="text-[11px] font-bold uppercase tracking-wide text-ink-400 mt-4">Cost breakdown</div><p class="text-sm text-ink-700 mt-1 whitespace-pre-line">{{ p.costBreakdown }}</p> }
            @if (p.comments) { <div class="text-[11px] font-bold uppercase tracking-wide text-ink-400 mt-4">Comments</div><p class="text-sm text-ink-700 mt-1">{{ p.comments }}</p> }
            @if (p.attachments.length) { <div class="text-[11px] font-bold uppercase tracking-wide text-ink-400 mt-4">Supporting attachments</div><div class="flex flex-wrap gap-1.5 mt-1.5">@for (a of p.attachments; track a) { <span class="status-chip status-chip--neutral">{{ a }}</span> }</div> }
          </div>
          <dl class="grid grid-cols-2 md:grid-cols-1 gap-y-3 text-sm content-start">
            <div><dt class="text-xs text-ink-400">Estimated project cost</dt><dd class="font-extrabold text-ink-900 text-base">{{ p.budget | number:'1.0-0' }} <span class="text-xs font-medium text-ink-400">{{ p.currency }}</span></dd></div>
            @if (p.annualCost !== undefined || p.monthlyCost !== undefined) { <div><dt class="text-xs text-ink-400">This financial year · per month</dt><dd class="font-medium text-ink-900">{{ p.annualCost === undefined ? '—' : (p.annualCost | number:'1.0-0') }} · {{ p.monthlyCost === undefined ? '—' : (p.monthlyCost | number:'1.0-0') }} {{ p.currency }}</dd></div> }
            <div><dt class="text-xs text-ink-400">Resource cost ({{ p.headCount }} head{{ p.headCount === 1 ? '' : 's' }})</dt><dd class="font-medium text-ink-900">{{ rc | number:'1.0-0' }} OMR</dd></div>
            <div><dt class="text-xs text-ink-400">Total in the budget</dt><dd class="font-extrabold text-brand-700">{{ total | number:'1.0-0' }} OMR</dd></div>
            <div><dt class="text-xs text-ink-400">Project manager · Line manager</dt><dd class="font-medium text-ink-900">{{ p.projectManager }} · {{ p.lineManager }}</dd></div>
            <div><dt class="text-xs text-ink-400">Reference · Department</dt><dd class="font-medium text-ink-900">{{ p.reference || '—' }} · {{ p.department || '—' }}</dd></div>
            <div><dt class="text-xs text-ink-400">Submitted</dt><dd class="font-medium text-ink-900">{{ p.submittedAt ? (p.submittedAt | date:'mediumDate') : 'Not submitted yet' }}</dd></div>
            <div><dt class="text-xs text-ink-400">Contract · PO</dt><dd class="font-medium text-ink-900">{{ p.contractRef || '—' }} · {{ p.poNumber || '—' }}</dd></div>
            <div><dt class="text-xs text-ink-400">Period</dt><dd class="font-medium text-ink-900">{{ p.from || '—' }} → {{ p.to || '—' }}</dd></div>
            @if (p.headCount) { <div><dt class="text-xs text-ink-400">Resources</dt><dd class="font-medium text-ink-900">{{ p.headCount }} × {{ p.resourceRole }} · {{ p.costPerResource | number:'1.0-0' }} {{ p.currency }} × {{ p.months }} months<br><span class="text-xs text-ink-500">{{ p.resourceType }} · {{ p.resourceSource }}{{ p.resourceStart ? ' · from ' + p.resourceStart : '' }}</span></dd></div> }
          </dl>
        </div>

        @if (p.decisionNote) {
          <div class="mt-5 rounded-lg border px-4 py-3 text-sm flex items-start gap-3" [class]="p.status === 'Returned for Modification' ? 'bg-orange-50 border-orange-200 text-ink-800' : 'bg-surface-subtle border-surface-border text-ink-700'">
            <mat-icon class="!text-lg" [class]="p.status === 'Returned for Modification' ? 'text-status-orange' : 'text-ink-400'">{{ p.status === 'Returned for Modification' ? 'undo' : 'chat_bubble_outline' }}</mat-icon>
            <div><div class="font-semibold text-ink-900">{{ p.status === 'Returned for Modification' ? 'Returned — what to change' : 'Decision note' }}</div><div class="mt-0.5">{{ p.decisionNote }}</div><div class="text-xs text-ink-400 mt-1">{{ p.decidedBy }} · {{ p.decidedAt | date:'medium' }}</div></div>
          </div>
        }

        <h3 class="text-[13.5px] font-bold text-ink-900 mt-6 mb-3">History</h3>
        <ol class="relative border-l border-surface-border ml-2 flex flex-col gap-4 list-none p-0 m-0 ml-2">
          @for (e of history; track $index) {
            <li class="pl-5 relative">
              <span class="absolute -left-[9px] top-0.5 w-[18px] h-[18px] rounded-full bg-white border border-surface-border flex items-center justify-center"><mat-icon class="!text-[13px] !w-[13px] !h-[13px] !leading-[13px] text-brand-600">{{ icon(e.action) }}</mat-icon></span>
              <div class="text-sm font-medium text-ink-900">{{ e.action }} <span class="text-ink-400 font-normal">· {{ e.by }} ({{ e.role }})</span></div>
              <div class="text-xs text-ink-500 mt-0.5">{{ e.note }}</div>
              <div class="text-[11px] text-ink-400 mt-0.5">{{ e.at | date:'medium' }}</div>
            </li>
          }
        </ol>
      </div>
    </div>
  `,
})
export class ProjectDetailDialogComponent {
  p: ProjectRequest;
  level: StatusLevel;
  priorityLevel: StatusLevel;
  history: ProjectRequest['history'];
  rc: number;
  total: number;

  constructor(@Inject(MAT_DIALOG_DATA) data: { project: ProjectRequest }, public ref: MatDialogRef<ProjectDetailDialogComponent>) {
    this.p = data.project;
    this.level = PROJECT_LEVEL[this.p.status];
    this.priorityLevel = PRIORITY_LEVEL[this.p.priority] ?? 'neutral';
    this.history = [...this.p.history].reverse();
    this.rc = resourceCost(this.p);
    this.total = projectTotal(this.p);
  }

  icon(action: string) { return EVENT_ICON[action] ?? 'circle'; }
}
