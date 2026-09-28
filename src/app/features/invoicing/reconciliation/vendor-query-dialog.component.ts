import { Component, Inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { DIALOG_SIZE } from '../../../shared/dialog-sizes';
import { MismatchDetailsDialogComponent } from './mismatch-details-dialog.component';
import { QueryDialogData, QueryDialogResult, QueryLine, diffOf, emailBody, f2, pctText, signed } from './mismatch';

/** A read-only window with the email exactly as the vendor will receive it. */
@Component({
  selector: 'app-email-preview-dialog',
  standalone: true,
  imports: [MatDialogModule, MatIconModule],
  template: `
    <div class="w-full">
      <div class="flex items-center justify-between gap-3 px-6 pt-5 pb-3 border-b border-surface-border">
        <div><h2 class="text-base font-bold text-ink-900">Email preview</h2><p class="text-xs text-ink-400 mt-0.5">Exactly what the vendor receives.</p></div>
        <button type="button" class="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:bg-surface-subtle" (click)="ref.close()"><mat-icon>close</mat-icon></button>
      </div>
      <div class="px-6 py-4 max-h-[70vh] overflow-y-auto">
        <div class="text-xs text-ink-500 mb-2"><b>To:</b> {{ data.to }}<br /><b>Subject:</b> {{ data.subject }}</div>
        <pre class="text-[12.5px] leading-relaxed text-ink-800 bg-surface-subtle border border-surface-border rounded-lg p-4 whitespace-pre-wrap font-sans">{{ data.body }}</pre>
      </div>
      <div class="flex justify-end px-6 py-3.5 border-t border-surface-border bg-surface-subtle"><button type="button" class="px-4 py-2 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700" (click)="ref.close()">Close</button></div>
    </div>
  `,
})
export class EmailPreviewDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: { to: string; subject: string; body: string }, public ref: MatDialogRef<EmailPreviewDialogComponent>) {}
}

/**
 * The email to a vendor about invoice lines that do not match. It stays short: recipients, which lines to include (each with
 * its difference and a Details button that opens the full explanation in its own window), a comment, and a preview window.
 */
@Component({
  selector: 'app-vendor-query-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatIconModule],
  template: `
    <div class="w-full">
      <div class="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-surface-border">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><mat-icon>mail</mat-icon></div>
          <div class="min-w-0">
            <h2 class="text-base font-bold text-ink-900">Email {{ data.vendor }}</h2>
            <p class="text-xs text-ink-400 mt-0.5">{{ data.contract }} · {{ data.contractName }} · {{ data.period }}</p>
          </div>
        </div>
        <button type="button" class="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:bg-surface-subtle hover:text-ink-700 shrink-0" (click)="ref.close()"><mat-icon>close</mat-icon></button>
      </div>

      <div class="px-6 py-5 max-h-[70vh] overflow-y-auto flex flex-col gap-4">
        <label class="block"><span class="lbl">To</span>
          <input class="inp" [ngModel]="to()" (ngModelChange)="to.set($event)" placeholder="accounts@vendor.com, finance@vendor.com" />
          <span class="text-[11px] text-ink-400">Separate multiple addresses with a comma.</span></label>
        <label class="block"><span class="lbl">Subject</span>
          <input class="inp" [ngModel]="subject()" (ngModelChange)="subject.set($event); subjectEdited = true" /></label>

        <section>
          <div class="flex flex-wrap items-baseline justify-between gap-2 mb-1.5">
            <span class="lbl !mb-0">Lines that do not match <span class="font-normal text-ink-400">(allowed ±{{ data.tolerancePct }}%)</span></span>
            <span class="text-xs text-ink-500"><b class="text-ink-800">{{ chosen().length }}</b> of {{ data.lines.length }} in the email · <b [class.text-status-red]="total() !== 0">{{ signed(total()) }} OMR</b> in total</span>
          </div>
          <div class="rounded-xl border border-surface-border bg-white divide-y divide-surface-border overflow-hidden">
            @for (l of data.lines; track l.key) {
              <div class="flex items-center gap-3 px-3.5 py-2.5" [class.opacity-55]="!isOn(l.key)">
                <input type="checkbox" class="w-4 h-4 accent-brand-600 cursor-pointer" [checked]="isOn(l.key)" (change)="toggle(l.key)" />
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-semibold text-ink-900 truncate">{{ l.label }}<span class="ml-1.5 text-[11px] font-normal text-ink-400">{{ l.linkedTo ? '· ' + l.linkedTo : '' }}</span></div>
                  <div class="text-xs text-ink-500">Invoiced <b class="text-ink-700">{{ f2(l.vendorAmount) }}</b> · we calculated <b class="text-ink-700">{{ f2(l.calculated) }}</b></div>
                </div>
                <div class="text-sm font-bold text-status-red tabular-nums whitespace-nowrap">{{ signed(diff(l)) }} <span class="text-xs font-semibold">({{ pctText(l) }})</span></div>
                <button type="button" class="inline-flex items-center gap-0.5 text-xs font-semibold text-brand-700 hover:underline whitespace-nowrap" (click)="details(l)">Details<mat-icon class="!text-base">chevron_right</mat-icon></button>
              </div>
            }
          </div>
        </section>

        <label class="block"><span class="lbl">Comment <span class="text-status-red">*</span></span>
          <textarea class="inp resize-y" rows="3" [ngModel]="comment()" (ngModelChange)="comment.set($event)" placeholder="e.g. Please re-issue the invoice with the calculated amounts, or send the supporting sheet for the difference."></textarea></label>
      </div>

      <div class="flex items-center justify-between gap-2 px-6 py-4 border-t border-surface-border bg-surface-subtle">
        <div class="flex items-center gap-3">
          <button type="button" class="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline" (click)="showPreview()"><mat-icon class="!text-base">visibility</mat-icon>Preview email</button>
          <span class="text-xs text-status-red">{{ problem() }}</span>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="px-4 py-2 text-sm font-semibold rounded-lg text-ink-600 hover:bg-white border border-transparent hover:border-surface-border transition-colors" (click)="ref.close()">Cancel</button>
          <button type="button" class="px-4 py-2 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors" [disabled]="!!problem()" (click)="send()">Send email</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .lbl { display: block; font-size: 13px; font-weight: 500; color: #413e5c; margin-bottom: 6px; }
    .inp { width: 100%; padding: 10px 12px; font-size: 14px; border-radius: 8px; border: 1px solid #e3e2ec; background: #fff; }
    .inp:focus { outline: none; border-color: #fb923c; }
    .opacity-55 { opacity: .55; }
  `],
})
export class VendorQueryDialogComponent {
  to = signal('');
  subject = signal('');
  comment = signal('');
  private on = signal<string[]>([]);
  subjectEdited = false;

  f2 = f2;
  signed = signed;
  pctText = pctText;
  diff = diffOf;

  constructor(@Inject(MAT_DIALOG_DATA) public data: QueryDialogData, public ref: MatDialogRef<VendorQueryDialogComponent, QueryDialogResult>, private dialog: MatDialog) {
    this.to.set(data.to);
    this.on.set([...data.selected]);
    this.subject.set(this.defaultSubject());
  }

  isOn = (key: string) => this.on().includes(key);
  toggle(key: string) {
    this.on.update((l) => (l.includes(key) ? l.filter((k) => k !== key) : [...l, key]));
    if (!this.subjectEdited) this.subject.set(this.defaultSubject());
  }
  chosen = computed(() => this.data.lines.filter((l) => this.on().includes(l.key)));
  total = computed(() => this.chosen().reduce((s, l) => s + diffOf(l), 0));

  private defaultSubject() {
    const names = this.chosen().map((l) => l.label);
    const text = names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
    return `Invoice query — ${this.data.contract}${text ? ' — ' + text : ''} — ${this.data.period}`;
  }

  problem = computed(() => {
    if (!this.to().trim()) return 'Enter at least one recipient.';
    if (!this.subject().trim()) return 'Enter a subject.';
    if (!this.chosen().length) return 'Tick at least one line.';
    if (!this.comment().trim()) return 'Add a comment.';
    return '';
  });

  details(l: QueryLine) {
    this.dialog.open(MismatchDetailsDialogComponent, { data: { vendor: this.data.vendor, contract: this.data.contract, period: this.data.period, tolerancePct: this.data.tolerancePct, line: l }, panelClass: 'app-dialog-panel', autoFocus: false, width: 'min(860px, 94vw)', maxWidth: '94vw' });
  }

  showPreview() {
    this.dialog.open(EmailPreviewDialogComponent, { data: { to: this.to(), subject: this.subject(), body: emailBody(this.data, this.chosen(), this.comment()) }, panelClass: 'app-dialog-panel', autoFocus: false, ...DIALOG_SIZE.form });
  }

  send() {
    if (this.problem()) return;
    this.ref.close({ to: this.to().trim(), subject: this.subject().trim(), keys: this.chosen().map((l) => l.key), comment: this.comment().trim() });
  }
}
