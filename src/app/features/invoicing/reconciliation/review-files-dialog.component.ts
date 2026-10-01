import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TxChannel } from '../../../core/services/transaction-invoice-import';

export interface ReviewFilesOpen { view: 'annexure' | 'transaction' | 'overtime' | 'msIncentive'; channel?: TxChannel }
export interface ReviewFilesData {
  title: string;
  subtitle: string;
  /** The files the vendor imported for this line; opening one shows its comparison with our calculation. */
  imported: Array<{ label: string; file: string; url?: string; open: ReviewFilesOpen }>;
  /** What the vendor attached when submitting: the invoice, the payment certificate and any others. */
  documents: Array<{ kind: string; name: string; size: number; url?: string }>;
  /** The vendor's manual Addition/Deduction adjustments submitted with the invoice. */
  adjustments: Array<{ type: 'Addition' | 'Deduction'; amount: number; reason: string }>;
  rejectReason?: string;
}

const kb = (n: number) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

/** Everything Billing needs to see before approving or rejecting a line: the vendor's imported file and the documents they attached. */
@Component({
  selector: 'app-review-files-dialog',
  standalone: true,
  imports: [MatDialogModule, MatIconModule],
  template: `
    <div class="w-full">
      <div class="px-6 pt-5 pb-3 border-b border-surface-border">
        <h2 class="text-base font-bold text-ink-900">Files &middot; {{ data.title }}</h2>
        <p class="text-xs text-ink-500 mt-0.5">{{ data.subtitle }}</p>
      </div>
      <div class="px-6 py-4 space-y-3 max-h-[65vh] overflow-y-auto">
        @if (data.rejectReason) {
          <div class="text-xs text-status-red bg-red-50 rounded-lg px-3 py-2">Rejected &mdash; {{ data.rejectReason }}</div>
        }
        @for (f of data.imported; track f.file) {
          <div class="rounded-lg border border-solid border-surface-border p-3 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="text-sm font-semibold text-ink-900">{{ f.label }}</div>
              <div class="text-xs text-ink-500 truncate">{{ f.file }}</div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              @if (f.url) { <a class="inline-flex items-center gap-1 h-8 px-3 text-xs font-semibold rounded-lg border border-solid border-brand-200 text-brand-700 bg-white hover:bg-brand-50" [href]="f.url" [attr.download]="f.file" target="_blank"><mat-icon class="!text-base !w-4 !h-4">download</mat-icon>Download</a> }
              <button type="button" class="inline-flex items-center gap-1 h-8 px-3 text-xs font-semibold rounded-lg border border-solid border-brand-200 text-brand-700 bg-white hover:bg-brand-50" (click)="ref.close(f.open)"><mat-icon class="!text-base !w-4 !h-4">compare_arrows</mat-icon>Open comparison</button>
            </div>
          </div>
        }
        @for (d of data.documents; track d.name) {
          <div class="rounded-lg border border-solid border-surface-border p-3 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="text-sm font-semibold text-ink-900">{{ d.kind === 'Other' ? 'Supporting document' : d.kind }}</div>
              <div class="text-xs text-ink-500 truncate">{{ d.name }} &middot; {{ size(d.size) }}</div>
            </div>
            @if (d.url) {
              <a class="inline-flex items-center gap-1 h-8 px-3 text-xs font-semibold rounded-lg border border-solid border-brand-200 text-brand-700 bg-white hover:bg-brand-50 shrink-0" [href]="d.url" [attr.download]="d.name" target="_blank"><mat-icon class="!text-base !w-4 !h-4">download</mat-icon>Download</a>
            } @else {
              <span class="text-[11px] text-ink-400 shrink-0">Demo file &mdash; not stored</span>
            }
          </div>
        }
        @if (data.adjustments.length) {
          <div class="rounded-lg border border-solid border-surface-border p-3">
            <div class="text-sm font-semibold text-ink-900 mb-1">Adjustments by the vendor</div>
            @for (a of data.adjustments; track $index) {
              <div class="flex items-start justify-between gap-3 text-xs py-1"><span class="text-ink-700">{{ a.reason }}</span><span class="font-semibold tabular-nums shrink-0" [class]="a.type === 'Addition' ? 'text-status-normal' : 'text-status-red'">{{ a.type === 'Addition' ? '+' : '−' }}{{ a.amount.toFixed(2) }} OMR</span></div>
            }
          </div>
        }
        @if (!data.imported.length && !data.documents.length && !data.adjustments.length) {
          <div class="text-sm text-ink-400 text-center py-6">No files have been attached to this line yet.</div>
        }
      </div>
      <div class="flex items-center justify-end px-6 py-3.5 border-t border-surface-border bg-surface-subtle">
        <button type="button" class="px-4 py-2 text-sm font-semibold rounded-lg text-ink-700 hover:bg-white" (click)="ref.close()">Close</button>
      </div>
    </div>
  `,
})
export class ReviewFilesDialogComponent {
  size = kb;
  constructor(@Inject(MAT_DIALOG_DATA) public data: ReviewFilesData, public ref: MatDialogRef<ReviewFilesDialogComponent, ReviewFilesOpen>) {}
}
