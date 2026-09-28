import { Component, Inject, computed, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface PaymentDocument { kind: 'Invoice' | 'Payment Certificate' | 'Other'; name: string; size: number }
export const MAX_OTHER_DOCUMENTS = 6;

const kb = (n: number) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

/** Shown once the user approves: the invoice and the payment certificate are mandatory, up to six more files are optional. */
@Component({
  selector: 'app-payment-documents-dialog',
  standalone: true,
  imports: [MatDialogModule, MatIconModule],
  template: `
    <div class="w-full">
      <div class="px-6 pt-5 pb-3 border-b border-surface-border">
        <h2 class="text-base font-bold text-ink-900">Attach the payment documents</h2>
        <p class="text-xs text-ink-500 mt-0.5">{{ data.summary }}</p>
      </div>
      <div class="px-6 py-4 space-y-3 max-h-[65vh] overflow-y-auto">
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
            <div class="text-sm font-semibold text-ink-900">Other documents <span class="text-[11px] font-normal text-ink-400">Optional · up to {{ max }} · {{ others().length }} added</span></div>
            <label class="inline-flex items-center gap-1 h-8 px-3 text-xs font-semibold rounded-lg border border-solid border-brand-200 text-brand-700 bg-white hover:bg-brand-50 cursor-pointer" [style.opacity]="others().length >= max ? .45 : 1" [style.pointer-events]="others().length >= max ? 'none' : 'auto'"><mat-icon class="!text-base !w-4 !h-4">add</mat-icon>Add files
              <input type="file" multiple class="hidden" (change)="pickOthers($event)" /></label>
          </div>
          @for (f of others(); track $index) {
            <div class="flex items-center justify-between gap-2 text-xs text-ink-700 mt-2"><span class="truncate">{{ f.name }} <span class="text-ink-400">{{ size(f.size) }}</span></span><button type="button" class="text-status-red hover:underline shrink-0" (click)="remove(f)">Remove</button></div>
          }
        </div>
      </div>
      <div class="flex items-center justify-end gap-2 px-6 py-3.5 border-t border-surface-border bg-surface-subtle">
        @if (!ready()) { <span class="text-xs text-ink-400 mr-auto">Add the invoice and the payment certificate to continue.</span> }
        <button type="button" class="px-4 py-2 text-sm font-semibold rounded-lg text-ink-700 hover:bg-white" (click)="ref.close()">Cancel</button>
        <button type="button" class="px-4 py-2 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed" [disabled]="!ready()" (click)="ref.close(files())">Approve &amp; submit</button>
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
  size = kb;

  constructor(@Inject(MAT_DIALOG_DATA) public data: { summary: string }, public ref: MatDialogRef<PaymentDocumentsDialogComponent, PaymentDocument[]>) {}

  fileOf(kind: PaymentDocument['kind']) { return this.files().find((f) => f.kind === kind); }
  remove(f: PaymentDocument) { this.files.update((l) => l.filter((x) => x !== f)); }

  pick(e: Event, kind: PaymentDocument['kind']) {
    const input = e.target as HTMLInputElement, f = input.files?.[0];
    if (f) this.files.update((l) => [...l.filter((x) => x.kind !== kind), { kind, name: f.name, size: f.size }]);
    input.value = '';
  }

  pickOthers(e: Event) {
    const input = e.target as HTMLInputElement;
    const room = this.max - this.others().length;
    const add = Array.from(input.files ?? []).slice(0, room).map((f): PaymentDocument => ({ kind: 'Other', name: f.name, size: f.size }));
    this.files.update((l) => [...l, ...add]);
    input.value = '';
  }
}
