import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Contract, ContractAttachment, ContractRecord } from '../../../core/models/domain';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { daysRemainingToLevel } from '../../../core/models/status';

export interface RecordDetailData {
  record: ContractRecord;
  parent: Contract;
  attachments: ContractAttachment[];
  canViewAttachments: boolean;
  openAttachment: (a: ContractAttachment, mode: 'view' | 'download') => void;
}

/** Read-only detail of one variation order line, amendment or time extension, with its contract and documents. */
@Component({
  selector: 'app-record-detail-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule, StatusChipComponent],
  template: `
    <div class="w-full">
      <div class="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-surface-border">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><mat-icon>receipt_long</mat-icon></div>
          <div class="min-w-0">
            <h2 class="text-base font-bold text-ink-900">{{ r.recordType }} · {{ r.reference }}</h2>
            <p class="text-xs text-ink-400 mt-0.5">{{ r.description }}</p>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <app-status-chip [label]="r.status" [level]="level"></app-status-chip>
          <button class="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:bg-surface-subtle hover:text-ink-700" (click)="ref.close()"><mat-icon>close</mat-icon></button>
        </div>
      </div>

      <div class="px-6 py-5 max-h-[70vh] overflow-y-auto">
        <dl class="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3.5 text-sm">
          @for (f of fields; track f[0]) {
            <div><dt class="text-xs text-ink-400">{{ f[0] }}</dt><dd class="font-medium text-ink-900">{{ f[1] }}</dd></div>
          }
        </dl>

        <div class="mt-5 rounded-lg bg-surface-subtle border border-surface-border px-4 py-3 text-sm flex items-center gap-3 flex-wrap">
          <mat-icon class="!text-lg text-ink-400">description</mat-icon>
          <span class="text-ink-500">Contract</span>
          <span class="font-semibold text-ink-900">{{ data.parent.reference }} — {{ data.parent.name }}</span>
          <span class="text-xs text-ink-400">({{ data.parent.vendorName }})</span>
        </div>

        <h3 class="text-[13.5px] font-bold text-ink-900 mt-5 mb-2">Documents ({{ data.attachments.length }})</h3>
        @if (!data.canViewAttachments) {
          <p class="text-sm text-ink-400">Your role does not have the "View Attachments" permission.</p>
        } @else if (!data.attachments.length) {
          <p class="text-sm text-ink-400">No documents are held in the ERP for this record.</p>
        } @else {
          <div class="flex flex-col gap-2">
            @for (a of data.attachments; track a.id) {
              <div class="flex items-center gap-3 border border-surface-border rounded-lg px-3 py-2">
                <mat-icon class="!text-lg text-brand-600">picture_as_pdf</mat-icon>
                <div class="flex-1 min-w-0"><div class="text-sm font-medium text-ink-900 truncate">{{ a.name }}</div><div class="text-xs text-ink-400">{{ a.category }} · {{ a.version }} · {{ a.erpAttachmentId }} · {{ a.erpDocumentRef }}</div></div>
                <button class="text-xs font-semibold text-brand-700 px-2 py-1 rounded-md hover:bg-brand-50" (click)="data.openAttachment(a, 'view')">View</button>
                <button class="text-xs font-semibold text-brand-700 px-2 py-1 rounded-md hover:bg-brand-50" (click)="data.openAttachment(a, 'download')">Download</button>
              </div>
            }
          </div>
        }
        <p class="text-xs text-ink-400 mt-4">Read-only — synced from the ERP. Correct any value in the ERP; it appears here after the next synchronization.</p>
      </div>
    </div>
  `,
})
export class RecordDetailDialogComponent {
  r: ContractRecord;
  fields: Array<[string, string]>;
  level = 'normal' as const;

  constructor(@Inject(MAT_DIALOG_DATA) public data: RecordDetailData, public ref: MatDialogRef<RecordDetailDialogComponent>) {
    const r = (this.r = data.record);
    this.level = (r.status === 'Closed' ? 'neutral' : r.status === 'Expiring Soon' ? daysRemainingToLevel(r.daysRemaining) : 'normal') as 'normal';
    this.fields = [
      ['Type', r.recordType], ['Scope of work', r.description], ['PO number', r.poNumber],
      ['Amount', r.amount === undefined ? '— (read from the ERP later)' : `${r.amount.toLocaleString('en-GB')} ${r.currency}`], ['From', r.startDate], ['To', r.endDate],
      ['Status', r.status], ['Days remaining', String(r.daysRemaining)], ['Contract', r.parentReference],
      ['Line reference', r.reference], ['ERP reference', r.erpReference], ['Vendor', r.counterparty],
    ];
  }
}
