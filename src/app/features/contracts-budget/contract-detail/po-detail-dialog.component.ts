import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Contract, ContractAttachment, PurchaseOrder } from '../../../core/models/domain';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { StatusLevel } from '../../../core/models/status';

export const PO_LEVEL: Record<string, StatusLevel> = { Active: 'normal', 'Expiring Soon': 'amber', Expired: 'red', Cancelled: 'neutral', Closed: 'neutral' };

export interface PoDetailData {
  po: PurchaseOrder;
  parent: Contract;
  attachments: ContractAttachment[];
  canViewAttachments: boolean;
  openAttachment: (a: ContractAttachment, mode: 'view' | 'download') => void;
}

/** Everything the ERP holds about one purchase order of a contract (SRS 1.8), with the records and documents under it. Read-only. */
@Component({
  selector: 'app-po-detail-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule, StatusChipComponent],
  template: `
    <div class="w-full">
      <div class="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-surface-border">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><mat-icon>request_quote</mat-icon></div>
          <div class="min-w-0"><h2 class="text-base font-bold text-ink-900">Purchase order {{ po.poNumber }}</h2>
            <p class="text-xs text-ink-400 mt-0.5">{{ po.main ? 'The contract\\'s main PO' : 'A further PO under this contract' }} · {{ data.parent.reference }}</p></div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <app-status-chip [label]="po.status" [level]="level"></app-status-chip>
          <button class="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:bg-surface-subtle hover:text-ink-700" (click)="ref.close()"><mat-icon>close</mat-icon></button>
        </div>
      </div>

      <div class="px-6 py-5 max-h-[70vh] overflow-y-auto">
        <dl class="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3.5 text-sm">
          @for (f of fields; track f[0]) { <div><dt class="text-xs text-ink-400">{{ f[0] }}</dt><dd class="font-medium text-ink-900">{{ f[1] }}</dd></div> }
        </dl>

        <div class="mt-5 rounded-lg bg-surface-subtle border border-surface-border px-4 py-3 text-sm flex items-center gap-3 flex-wrap">
          <mat-icon class="!text-lg text-ink-400">account_tree</mat-icon><span class="text-ink-500">Parent contract</span>
          <span class="font-semibold text-ink-900">{{ data.parent.reference }} — {{ data.parent.name }}</span><span class="text-xs text-ink-400">({{ data.parent.vendorName }})</span>
        </div>

        <h3 class="text-[13.5px] font-bold text-ink-900 mt-5 mb-2">Records under this PO ({{ po.records.length }})</h3>
        @if (po.records.length) {
          <div class="overflow-x-auto">
            <table class="crc-table w-full text-sm">
              <thead><tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide"><th class="px-3 py-2 font-medium">Reference</th><th class="px-3 py-2 font-medium">Type</th><th class="px-3 py-2 font-medium">Scope of work</th><th class="px-3 py-2 font-medium">From</th><th class="px-3 py-2 font-medium">To</th><th class="px-3 py-2 font-medium text-right">Amount</th><th class="px-3 py-2 font-medium">Status</th></tr></thead>
              <tbody>@for (r of po.records; track r.id) { <tr class="border-t border-surface-border"><td class="px-3 py-1.5 whitespace-nowrap">{{ r.reference }}</td><td class="px-3 py-1.5">{{ r.recordType }}</td><td class="px-3 py-1.5 text-ink-600">{{ r.description }}</td><td class="px-3 py-1.5 whitespace-nowrap">{{ r.startDate }}</td><td class="px-3 py-1.5 whitespace-nowrap">{{ r.endDate }}</td><td class="px-3 py-1.5 text-right">{{ r.amount === undefined ? '—' : (r.amount | number:'1.0-0') }}</td><td class="px-3 py-1.5">{{ r.status }}</td></tr> }</tbody>
            </table>
          </div>
        } @else { <p class="text-sm text-ink-400">No variation orders, amendments or extensions are recorded under this PO.</p> }

        <h3 class="text-[13.5px] font-bold text-ink-900 mt-5 mb-2">Documents ({{ data.attachments.length }})</h3>
        @if (!data.canViewAttachments) { <p class="text-sm text-ink-400">Your role does not have the "View Attachments" permission.</p> }
        @else if (!data.attachments.length) { <p class="text-sm text-ink-400">No documents are held in the ERP for this PO.</p> }
        @else {
          <div class="flex flex-col gap-2">
            @for (a of data.attachments; track a.id) {
              <div class="flex items-center gap-3 border border-surface-border rounded-lg px-3 py-2"><mat-icon class="!text-lg text-brand-600">picture_as_pdf</mat-icon>
                <div class="flex-1 min-w-0"><div class="text-sm font-medium text-ink-900 truncate">{{ a.name }}</div><div class="text-xs text-ink-400">{{ a.category }} · {{ a.version }} · {{ a.linkedTo }}</div></div>
                <button class="text-xs font-semibold text-brand-700 px-2 py-1 rounded-md hover:bg-brand-50" (click)="data.openAttachment(a, 'view')">View</button>
                <button class="text-xs font-semibold text-brand-700 px-2 py-1 rounded-md hover:bg-brand-50" (click)="data.openAttachment(a, 'download')">Download</button></div>
            }
          </div>
        }
        <p class="text-xs text-ink-400 mt-4">Read-only — synced from the ERP. Correct any value in the ERP; it appears here after the next synchronization.</p>
      </div>
    </div>
  `,
})
export class PoDetailDialogComponent {
  po: PurchaseOrder;
  level: StatusLevel;
  fields: Array<[string, string]>;

  constructor(@Inject(MAT_DIALOG_DATA) public data: PoDetailData, public ref: MatDialogRef<PoDetailDialogComponent>) {
    const p = (this.po = data.po);
    this.level = PO_LEVEL[p.status] ?? 'neutral';
    this.fields = [
      ['PO number', p.poNumber], ['PO type', p.poType], ['PO category', p.category],
      ['PO amount', p.amount === undefined ? '— (read from the ERP later)' : `${p.amount.toLocaleString('en-GB')} ${p.currency}`], ['PO date', p.poDate], ['PO status', p.status],
      ['PO start date', p.startDate], ['PO end date', p.endDate], ['Parent contract', p.parentReference],
      ['ERP reference', p.erpReference], ['Documents', String(data.attachments.length)], ['Source system', 'ERP'],
    ];
  }
}
