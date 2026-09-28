import { Component, Inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { CURRENT_USER } from '../../../core/services/crc-store.service';

/** One line that does not match, with everything the vendor needs to see where the difference is. */
export interface QueryLine {
  key: string;
  label: string;
  /** What the line is linked to on Payable Line Mapping (Salary, Incentive, ...), if anything. */
  linkedTo: string | null;
  calculated: number;
  vendorAmount: number;
  /** How our figure is built: one row per part, or the contract's share. */
  parts: Array<{ label: string; amount: number }>;
  basis?: string;
  note?: string;
}
export interface QueryDialogData { vendor: string; contract: string; contractName: string; period: string; to: string; tolerancePct: number; lines: QueryLine[]; selected: string[] }
export interface QueryDialogResult { to: string; subject: string; keys: string[]; comment: string }

const f2 = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + f2(Math.abs(n));

/**
 * The email to a vendor about invoice lines that do not match: for each line what they invoiced, what we calculated,
 * the difference against the allowed tolerance, and how our figure is made up — plus a preview of the exact email.
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

      <div class="px-6 py-5 max-h-[72vh] overflow-y-auto flex flex-col gap-5">
        <!-- recipients -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label class="block sm:col-span-2"><span class="lbl">To</span>
            <input class="inp" [ngModel]="to()" (ngModelChange)="to.set($event)" placeholder="accounts@vendor.com, finance@vendor.com" />
            <span class="text-[11px] text-ink-400">Separate multiple addresses with a comma.</span></label>
          <label class="block sm:col-span-2"><span class="lbl">Subject</span>
            <input class="inp" [ngModel]="subject()" (ngModelChange)="subject.set($event); subjectEdited = true" /></label>
        </div>

        <!-- what does not match -->
        <section>
          <div class="flex flex-wrap items-end justify-between gap-2 mb-2">
            <div>
              <h3 class="text-[13.5px] font-bold text-ink-900">What does not match</h3>
              <p class="text-xs text-ink-400">Tick the lines to include. Allowed difference: <b class="text-ink-600">±{{ data.tolerancePct }}%</b> of our calculation.</p>
            </div>
            <div class="text-xs text-ink-500">
              <b class="text-ink-800">{{ chosen().length }}</b> of {{ data.lines.length }} selected ·
              invoiced <b class="text-ink-800">{{ total().invoiced | number:'1.2-2' }}</b> vs calculated <b class="text-ink-800">{{ total().calculated | number:'1.2-2' }}</b> ·
              <b [class.text-status-red]="total().diff !== 0">{{ signedText(total().diff) }} OMR</b>
            </div>
          </div>

          <div class="flex flex-col gap-3">
            @for (l of data.lines; track l.key) {
              <article class="rounded-xl border bg-white overflow-hidden" [class.border-brand-300]="isOn(l.key)" [class.border-surface-border]="!isOn(l.key)" [class.opacity-60]="!isOn(l.key)">
                <header class="flex items-center gap-3 px-4 py-3 bg-surface-subtle/60 border-b border-surface-border">
                  <input type="checkbox" class="w-4 h-4 accent-brand-600 cursor-pointer" [checked]="isOn(l.key)" (change)="toggle(l.key)" />
                  <div class="flex-1 min-w-0">
                    <div class="font-bold text-ink-900">{{ l.label }}</div>
                    <div class="text-[11px] text-ink-400">{{ l.linkedTo ? 'Linked to ' + l.linkedTo : 'Contract monthly share — not linked to a calculation' }}</div>
                  </div>
                  <div class="text-right">
                    <div class="text-sm font-extrabold text-status-red tabular-nums">{{ signedText(diff(l)) }} OMR <span class="font-semibold">({{ pctText(l) }})</span></div>
                    <div class="text-[11px] text-ink-500">{{ diff(l) < 0 ? 'Invoiced less than we calculated' : 'Invoiced more than we calculated' }}</div>
                  </div>
                </header>

                <div class="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div><div class="k">We calculated</div><div class="v">{{ l.calculated | number:'1.2-2' }}</div></div>
                  <div><div class="k">Vendor invoiced</div><div class="v">{{ l.vendorAmount | number:'1.2-2' }}</div></div>
                  <div><div class="k">Difference</div><div class="v" [class.text-status-red]="true">{{ signedText(diff(l)) }}</div></div>
                  <div><div class="k">Allowed (±{{ data.tolerancePct }}%)</div><div class="v">± {{ tolerance(l) | number:'1.2-2' }}<span class="block text-[11px] font-normal text-status-red">outside by {{ outside(l) | number:'1.2-2' }}</span></div></div>
                </div>

                <div class="px-4 pb-3">
                  <div class="text-[11px] font-bold uppercase tracking-wide text-ink-400 mb-1">How we calculated {{ l.calculated | number:'1.2-2' }}</div>
                  @if (l.parts.length) {
                    <div class="rounded-lg border border-surface-border text-xs">
                      @for (p of l.parts; track p.label) {
                        <div class="flex justify-between gap-4 px-3 py-1.5 border-b border-surface-border last:border-0"><span class="text-ink-600">{{ p.label }}</span><span class="font-medium text-ink-800 tabular-nums">{{ p.amount | number:'1.2-2' }}</span></div>
                      }
                      <div class="flex justify-between gap-4 px-3 py-1.5 bg-surface-subtle font-bold text-ink-900"><span>Total</span><span class="tabular-nums">{{ l.calculated | number:'1.2-2' }}</span></div>
                    </div>
                  } @else { <p class="text-xs text-ink-500">{{ l.basis }}.</p> }
                  @if (l.note) { <p class="text-[11px] text-status-amber mt-1.5">{{ l.note }}</p> }
                </div>
              </article>
            }
          </div>
        </section>

        <!-- comment -->
        <label class="block"><span class="lbl">Comment <span class="text-status-red">*</span></span>
          <textarea class="inp resize-y" rows="3" [ngModel]="comment()" (ngModelChange)="comment.set($event)" placeholder="e.g. Please re-issue the invoice with the calculated amounts, or send the supporting sheet for the difference."></textarea></label>

        <!-- exactly what the vendor gets -->
        <section>
          <button type="button" class="flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline" (click)="preview.set(!preview())">
            <mat-icon class="!text-lg">{{ preview() ? 'expand_less' : 'expand_more' }}</mat-icon>{{ preview() ? 'Hide' : 'Show' }} the email as the vendor will receive it
          </button>
          @if (preview()) { <pre class="mt-2 text-[12px] leading-relaxed text-ink-700 bg-surface-subtle border border-surface-border rounded-lg p-3.5 whitespace-pre-wrap font-sans">{{ body() }}</pre> }
        </section>
      </div>

      <div class="flex items-center justify-between gap-2 px-6 py-4 border-t border-surface-border bg-surface-subtle">
        <span class="text-xs text-status-red">{{ problem() }}</span>
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
    .k { font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: .03em; }
    .v { font-size: 15px; font-weight: 700; color: #191733; font-variant-numeric: tabular-nums; }
  `],
})
export class VendorQueryDialogComponent {
  to = signal('');
  subject = signal('');
  comment = signal('');
  preview = signal(false);
  private on = signal<string[]>([]);
  subjectEdited = false;

  constructor(@Inject(MAT_DIALOG_DATA) public data: QueryDialogData, public ref: MatDialogRef<VendorQueryDialogComponent, QueryDialogResult>) {
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

  signedText = signed;
  diff = (l: QueryLine) => l.vendorAmount - l.calculated;
  pct = (l: QueryLine) => (l.calculated ? (this.diff(l) / l.calculated) * 100 : 0);
  pctText = (l: QueryLine) => `${this.pct(l) > 0 ? '+' : this.pct(l) < 0 ? '−' : ''}${Math.abs(this.pct(l)).toFixed(1)}%`;
  tolerance = (l: QueryLine) => Math.abs(l.calculated) * (this.data.tolerancePct / 100);
  outside = (l: QueryLine) => Math.max(0, Math.abs(this.diff(l)) - this.tolerance(l));

  total = computed(() => {
    const invoiced = this.chosen().reduce((s, l) => s + l.vendorAmount, 0), calculated = this.chosen().reduce((s, l) => s + l.calculated, 0);
    return { invoiced, calculated, diff: invoiced - calculated };
  });

  private defaultSubject() {
    const names = this.chosen().map((l) => l.label);
    const text = names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
    return `Invoice query — ${this.data.contract}${text ? ' — ' + text : ''} — ${this.data.period}`;
  }

  /** The email exactly as it is sent. */
  body = computed(() => {
    const d = this.data, out: string[] = [];
    out.push(`Dear ${d.vendor},`, '', `We checked your ${d.period} invoice for contract ${d.contract} (${d.contractName}). The lines below do not match our calculation; the allowed difference is ±${d.tolerancePct}%.`, '');
    this.chosen().forEach((l, i) => {
      const df = this.diff(l);
      out.push(`${i + 1}. ${l.label}${l.linkedTo ? ` (linked to ${l.linkedTo})` : ''}`);
      out.push(`   Your invoice:      ${f2(l.vendorAmount)} OMR`, `   Our calculation:   ${f2(l.calculated)} OMR`);
      out.push(`   Difference:        ${signed(df)} OMR (${this.pctText(l)}) — you invoiced ${f2(Math.abs(df))} OMR ${df < 0 ? 'less' : 'more'} than we calculated`);
      out.push(`   Allowed:           ±${f2(this.tolerance(l))} OMR — the difference is outside it by ${f2(this.outside(l))} OMR`);
      out.push('   How we calculated it:');
      if (l.parts.length) { l.parts.forEach((p) => out.push(`     - ${p.label}: ${f2(p.amount)}`)); out.push(`     = ${f2(l.calculated)} OMR`); }
      else out.push(`     - ${l.basis ?? 'Contract share'}`);
      out.push('');
    });
    const t = this.total();
    if (this.chosen().length > 1) out.push(`Together: you invoiced ${f2(t.invoiced)} OMR, we calculated ${f2(t.calculated)} OMR (${signed(t.diff)} OMR).`, '');
    out.push(this.comment().trim() || '[your comment]', '', 'Kind regards,', `${CURRENT_USER}`, 'Omantel Customer Care');
    return out.join('\n');
  });

  problem = computed(() => {
    if (!this.to().trim()) return 'Enter at least one recipient.';
    if (!this.subject().trim()) return 'Enter a subject.';
    if (!this.chosen().length) return 'Tick at least one line.';
    if (!this.comment().trim()) return 'Add a comment.';
    return '';
  });

  send() {
    if (this.problem()) return;
    this.ref.close({ to: this.to().trim(), subject: this.subject().trim(), keys: this.chosen().map((l) => l.key), comment: this.comment().trim() });
  }
}
