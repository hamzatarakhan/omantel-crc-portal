import { Component, Inject, computed, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { InvoiceAdjustment } from '../../../core/models/domain';

export interface PaymentDocument { kind: 'Invoice' | 'Payment Certificate' | 'Claiming Sheet' | 'Other'; name: string; size: number; url?: string }
export const MAX_OTHER_DOCUMENTS = 6;
/** What the vendor hands in when submitting: the attached documents and any manual adjustments to the invoice. */
export interface SubmitPackage { documents: PaymentDocument[]; adjustments: InvoiceAdjustment[] }

const kb = (n: number) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

/** Shown when the vendor submits lines for approval: the invoice and the payment certificate are mandatory, up to six more files are optional. */
@Component({
  selector: 'app-payment-documents-dialog',
  standalone: true,
  imports: [MatDialogModule, MatIconModule, FormsModule],
  template: `
    <div class="w-full">
      <div class="px-6 pt-5 pb-3 border-b border-surface-border">
        <h2 class="text-base font-bold text-ink-900">Attach the invoice documents</h2>
        <p class="text-xs text-ink-500 mt-0.5">{{ data.summary }}</p>
      </div>
      <div class="px-6 py-4 space-y-3 max-h-[65vh] overflow-y-auto">
        @if (data.claimingSheet; as cs) {
          <div class="rounded-lg border border-solid border-surface-border p-3 flex items-center justify-between gap-3">
            <div class="text-sm font-semibold text-ink-900">Claiming sheet <span class="text-[11px] font-normal text-ink-400">Attached automatically from your import</span></div>
            <div class="flex items-center gap-2 text-xs text-ink-700 min-w-0"><mat-icon class="!text-base !w-4 !h-4 text-status-green shrink-0">check_circle</mat-icon><span class="truncate">{{ cs.name }}</span></div>
          </div>
        }
        @for (slot of slots; track slot.kind) {
          <div class="rounded-lg border border-solid border-surface-border p-3">
            <div class="flex items-center justify-between gap-3">
              <div class="text-sm font-semibold text-ink-900">{{ slot.kind }} <span class="text-status-red">*</span> <span class="text-[11px] font-normal text-ink-400">Required</span></div>
              @if (fileOf(slot.kind); as f) {
                <div class="flex items-center gap-2 text-xs text-ink-700"><mat-icon class="!text-base !w-4 !h-4 text-status-green">check_circle</mat-icon>{{ f.name }} <span class="text-ink-400">{{ size(f.size) }}</span>
                  <button type="button" class="text-status-red hover:underline" (click)="remove(f)">Remove</button></div>
              } @else {
                <label class="inline-flex items-center gap-1 h-8 px-3 text-xs font-semibold rounded-lg border border-solid border-brand-200 text-brand-700 bg-white hover:bg-brand-50 cursor-pointer"><mat-icon class="!text-base !w-4 !h-4">upload_file</mat-icon>Choose file
                  <input type="file" class="hidden" (change)="pick($event, slot.kind)" /></label>
              }
            </div>
          </div>
        }
        <div class="rounded-lg border border-solid border-surface-border p-3">
          <div class="flex items-center justify-between gap-3">
            <div class="text-sm font-semibold text-ink-900">Supporting documents <span class="text-[11px] font-normal text-ink-400">Optional · up to {{ max }} · {{ others().length }} added</span></div>
            <label class="inline-flex items-center gap-1 h-8 px-3 text-xs font-semibold rounded-lg border border-solid border-brand-200 text-brand-700 bg-white hover:bg-brand-50 cursor-pointer" [style.opacity]="others().length >= max ? .45 : 1" [style.pointer-events]="others().length >= max ? 'none' : 'auto'"><mat-icon class="!text-base !w-4 !h-4">add</mat-icon>Add files
              <input type="file" multiple class="hidden" (change)="pickOthers($event)" /></label>
          </div>
          @for (f of others(); track $index) {
            <div class="flex items-center justify-between gap-2 text-xs text-ink-700 mt-2"><span class="truncate">{{ f.name }} <span class="text-ink-400">{{ size(f.size) }}</span></span><button type="button" class="text-status-red hover:underline shrink-0" (click)="remove(f)">Remove</button></div>
          }
        </div>
        <div class="rounded-lg border border-solid border-surface-border p-3">
          <div class="flex items-center justify-between gap-3">
            <div class="text-sm font-semibold text-ink-900">Adjustments <span class="text-[11px] font-normal text-ink-400">Optional · e.g. a sick-leave correction from a previous month</span></div>
            <button type="button" class="inline-flex items-center gap-1 h-8 px-3 text-xs font-semibold rounded-lg border border-solid border-brand-200 text-brand-700 bg-white hover:bg-brand-50" (click)="addAdjustment()"><mat-icon class="!text-base !w-4 !h-4">add</mat-icon>Add adjustment</button>
          </div>
          @for (a of adjustments(); track $index; let i = $index) {
            @if (a.changeId) {
              <div class="flex items-start justify-between gap-3 mt-2 text-xs rounded-lg bg-surface-subtle px-3 py-2"><span class="text-ink-700">{{ a.reason }} <span class="text-ink-400">· added automatically from an attendance change</span></span><span class="font-semibold tabular-nums shrink-0" [class]="a.type === 'Addition' ? 'text-status-normal' : 'text-status-red'">{{ a.type === 'Addition' ? '+' : '−' }}{{ a.amount.toFixed(3) }} OMR</span></div>
            } @else {
            <div class="flex items-center gap-2 mt-2">
              <select [(ngModel)]="a.type" class="h-8 px-2 text-xs rounded-lg border border-surface-border bg-white">
                <option value="Addition">Addition</option>
                <option value="Deduction">Deduction</option>
              </select>
              <input type="number" min="0" step="0.01" [(ngModel)]="a.amount" placeholder="Amount (OMR)" class="w-32 h-8 px-2 text-xs rounded-lg border border-surface-border" />
              <input type="text" [(ngModel)]="a.reason" placeholder="Reason / justification" class="flex-1 min-w-0 h-8 px-2 text-xs rounded-lg border border-surface-border" />
              <button type="button" class="text-status-red hover:underline text-xs shrink-0" (click)="removeAdjustment(i)">Remove</button>
            </div>
            }
          }
          @if (adjustments().length) {
            <div class="text-[11px] mt-2" [class]="adjustmentsOk() ? 'text-ink-400' : 'text-status-red'">{{ adjustmentsOk() ? 'Net adjustment: ' + (net() >= 0 ? '+' : '') + net().toFixed(2) + ' OMR — shown to Billing with the invoice.' : 'Every adjustment needs an amount above zero and a reason.' }}</div>
          }
        </div>
      </div>
      <div class="flex items-center justify-end gap-2 px-6 py-3.5 border-t border-surface-border bg-surface-subtle">
        @if (!ready()) { <span class="text-xs text-ink-400 mr-auto">Add the invoice and the payment certificate to continue.</span> }
        <button type="button" class="px-4 py-2 text-sm font-semibold rounded-lg text-ink-700 hover:bg-white" (click)="ref.close()">Cancel</button>
        <button type="button" class="px-4 py-2 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed" [disabled]="!ready() || !adjustmentsOk()" (click)="ref.close({ documents: sheetDocs().concat(files()), adjustments: adjustments() })">Submit for approval</button>
      </div>
    </div>
  `,
})
export class PaymentDocumentsDialogComponent {
  readonly slots = [{ kind: 'Invoice' as const }, { kind: 'Payment Certificate' as const }];
  readonly max = MAX_OTHER_DOCUMENTS;
  files = signal<PaymentDocument[]>([]);
  others = computed(() => this.files().filter((f) => f.kind === 'Other'));
  ready = computed(() => this.slots.every((s) => this.files().some((f) => f.kind === s.kind)));
  sheetDocs = (): PaymentDocument[] => (this.data.claimingSheet ? [{ kind: 'Claiming Sheet', name: this.data.claimingSheet.name, size: 0, url: this.data.claimingSheet.url }] : []);
  adjustments = signal<InvoiceAdjustment[]>([]);
  adjustmentsOk = computed(() => this.adjustments().every((a) => a.amount > 0 && a.reason.trim().length > 0));
  net = computed(() => this.adjustments().reduce((t, a) => t + (a.type === 'Addition' ? a.amount : -a.amount), 0));
  size = kb;

  constructor(@Inject(MAT_DIALOG_DATA) public data: { summary: string; prefill?: InvoiceAdjustment[]; claimingSheet?: { name: string; url?: string } }, public ref: MatDialogRef<PaymentDocumentsDialogComponent, SubmitPackage>) {
    this.adjustments.set((data.prefill ?? []).map((a) => ({ ...a })));
  }

  addAdjustment() { this.adjustments.update((l) => [...l, { type: 'Deduction', amount: 0, reason: '' }]); }
  removeAdjustment(i: number) { this.adjustments.update((l) => l.filter((_, idx) => idx !== i)); }

  fileOf(kind: PaymentDocument['kind']) { return this.files().find((f) => f.kind === kind); }
  remove(f: PaymentDocument) { this.files.update((l) => l.filter((x) => x !== f)); }

  pick(e: Event, kind: PaymentDocument['kind']) {
    const input = e.target as HTMLInputElement, f = input.files?.[0];
    if (f) this.files.update((l) => [...l.filter((x) => x.kind !== kind), { kind, name: f.name, size: f.size, url: URL.createObjectURL(f) }]);
    input.value = '';
  }

  pickOthers(e: Event) {
    const input = e.target as HTMLInputElement;
    const room = this.max - this.others().length;
    const add = Array.from(input.files ?? []).slice(0, room).map((f): PaymentDocument => ({ kind: 'Other', name: f.name, size: f.size, url: URL.createObjectURL(f) }));
    this.files.update((l) => [...l, ...add]);
    input.value = '';
  }
}
