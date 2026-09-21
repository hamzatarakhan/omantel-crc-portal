import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { Submission } from '../../../core/services/budget-cycle.service';

export interface ConfirmationData { submission: Submission; year: string; canResend: boolean }

/** Screen 7 — Submission Confirmation. Closes with 'download' or 'resend' when the user picks one of those. */
@Component({
  selector: 'app-submission-confirmation-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule, StatusChipComponent],
  template: `
    <div class="w-full">
      <div class="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-surface-border">
        <div class="flex items-center gap-3"><mat-icon [class]="ok ? 'text-status-normal' : 'text-status-amber'" class="!text-3xl !w-8 !h-8">{{ ok ? 'task_alt' : 'warning_amber' }}</mat-icon>
          <div><h2 class="text-base font-bold text-ink-900">{{ ok ? 'Budget submitted' : 'Budget submitted — email failed' }}</h2><p class="text-xs text-ink-400 mt-0.5">{{ s.reference }} · version {{ s.version }}</p></div></div>
        <button class="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:bg-surface-subtle" (click)="ref.close()"><mat-icon>close</mat-icon></button>
      </div>
      <div class="px-6 py-5">
        <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div><dt class="text-xs text-ink-400">Submission reference</dt><dd class="font-medium text-ink-900">{{ s.reference }}</dd></div>
          <div><dt class="text-xs text-ink-400">Financial year</dt><dd class="font-medium text-ink-900">{{ data.year }}</dd></div>
          <div><dt class="text-xs text-ink-400">Total proposed budget</dt><dd class="font-extrabold text-brand-700">{{ s.total | number:'1.0-0' }} OMR</dd></div>
          <div><dt class="text-xs text-ink-400">Submitted</dt><dd class="font-medium text-ink-900">{{ s.at | date:'medium' }} by {{ s.by }}</dd></div>
          <div class="col-span-2"><dt class="text-xs text-ink-400">Email recipients</dt><dd class="font-medium text-ink-900">{{ s.recipients || '—' }}</dd></div>
          <div class="col-span-2"><dt class="text-xs text-ink-400">Generated budget sheet</dt><dd class="font-medium text-ink-900">{{ s.fileName }}</dd></div>
          <div><dt class="text-xs text-ink-400">Email status</dt><dd class="mt-0.5"><app-status-chip [label]="s.emailStatus" [level]="ok ? 'normal' : 'red'"></app-status-chip></dd></div>
        </dl>
        @if (!ok) { <div class="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-ink-700">{{ s.emailError }} The budget sheet is kept. Fix the recipients and resend — this does not create a new submission.</div> }
      </div>
      <div class="flex items-center justify-end gap-2 px-6 py-4 border-t border-surface-border bg-surface-subtle">
        <button class="px-4 py-2 text-sm font-semibold rounded-lg text-ink-600 hover:bg-white border border-transparent hover:border-surface-border" (click)="ref.close()">Close</button>
        @if (data.canResend) { <button class="px-4 py-2 text-sm font-semibold rounded-lg border border-brand-500 text-brand-700 hover:bg-brand-50" (click)="ref.close('resend')">Resend email</button> }
        <button class="px-4 py-2 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700" (click)="ref.close('download')">Download budget sheet</button>
      </div>
    </div>
  `,
})
export class SubmissionConfirmationDialogComponent {
  s: Submission;
  ok: boolean;
  constructor(@Inject(MAT_DIALOG_DATA) public data: ConfirmationData, public ref: MatDialogRef<SubmissionConfirmationDialogComponent>) {
    this.s = data.submission;
    this.ok = this.s.emailStatus === 'Sent';
  }
}
