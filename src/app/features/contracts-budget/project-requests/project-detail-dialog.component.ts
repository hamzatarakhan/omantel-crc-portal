import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { StatusLevel } from '../../../core/models/status';
import { ProjectRequest } from '../../../core/services/project-data';

export const PROJECT_LEVEL: Record<string, StatusLevel> = { Draft: 'neutral', Submitted: 'amber', Kept: 'normal', 'Sent back': 'orange', Removed: 'red' };
const EVENT_ICON: Record<string, string> = { Created: 'add_circle', Edited: 'edit', Submitted: 'send', Resubmitted: 'send', Kept: 'check_circle', 'Sent back': 'undo', Removed: 'delete' };

/** Everything about one project request: what it is, why it is needed, the decision and the full history. */
@Component({
  selector: 'app-project-detail-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule, StatusChipComponent],
  template: `
    <div class="w-full">
      <div class="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-surface-border">
        <div class="min-w-0">
          <h2 class="text-base font-bold text-ink-900">{{ p.name }}</h2>
          <p class="text-xs text-ink-400 mt-0.5">Requested by {{ p.requestedBy }}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <app-status-chip [label]="p.status" [level]="level"></app-status-chip>
          <button class="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:bg-surface-subtle hover:text-ink-700" (click)="ref.close()"><mat-icon>close</mat-icon></button>
        </div>
      </div>

      <div class="px-6 py-5 max-h-[72vh] overflow-y-auto">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
          <div class="md:col-span-2">
            <div class="text-[11px] font-bold uppercase tracking-wide text-ink-400">Scope of work</div>
            <p class="text-sm text-ink-900 mt-1">{{ p.scope }}</p>
            <div class="text-[11px] font-bold uppercase tracking-wide text-ink-400 mt-4">Why it is needed</div>
            <p class="text-sm text-ink-700 mt-1 leading-relaxed">{{ p.reason }}</p>
          </div>
          <dl class="grid grid-cols-2 md:grid-cols-1 gap-y-3 text-sm content-start">
            <div><dt class="text-xs text-ink-400">Budget needed</dt><dd class="font-extrabold text-ink-900 text-base">{{ p.budget | number:'1.0-0' }} <span class="text-xs font-medium text-ink-400">OMR</span></dd></div>
            <div><dt class="text-xs text-ink-400">Contract</dt><dd class="font-medium text-ink-900">{{ p.contractRef || '—' }}</dd></div>
            <div><dt class="text-xs text-ink-400">PO number</dt><dd class="font-medium text-ink-900">{{ p.poNumber || '—' }}</dd></div>
            <div><dt class="text-xs text-ink-400">Period</dt><dd class="font-medium text-ink-900">{{ p.from || '—' }} → {{ p.to || '—' }}</dd></div>
          </dl>
        </div>

        @if (p.decisionNote) {
          <div class="mt-5 rounded-lg border px-4 py-3 text-sm flex items-start gap-3" [class]="p.status === 'Sent back' ? 'bg-orange-50 border-orange-200 text-ink-800' : 'bg-surface-subtle border-surface-border text-ink-700'">
            <mat-icon class="!text-lg" [class]="p.status === 'Sent back' ? 'text-status-orange' : 'text-ink-400'">{{ p.status === 'Sent back' ? 'undo' : 'chat_bubble_outline' }}</mat-icon>
            <div><div class="font-semibold text-ink-900">{{ p.status === 'Sent back' ? 'Sent back — what to change' : 'Decision note' }}</div><div class="mt-0.5">{{ p.decisionNote }}</div><div class="text-xs text-ink-400 mt-1">{{ p.decidedBy }} · {{ p.decidedAt | date:'medium' }}</div></div>
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
  history: ProjectRequest['history'];

  constructor(@Inject(MAT_DIALOG_DATA) data: { project: ProjectRequest }, public ref: MatDialogRef<ProjectDetailDialogComponent>) {
    this.p = data.project;
    this.level = PROJECT_LEVEL[this.p.status];
    this.history = [...this.p.history].reverse();
  }

  icon(action: string) { return EVENT_ICON[action] ?? 'circle'; }
}
