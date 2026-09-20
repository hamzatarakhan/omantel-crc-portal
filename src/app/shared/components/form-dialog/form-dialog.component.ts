import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface FormField {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'email' | 'date' | 'time' | 'select' | 'textarea';
  options?: Array<string | { value: string; label: string }>;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  min?: number;
  max?: number;
}

export interface FormDialogData {
  title: string;
  subtitle?: string;
  icon?: string;
  fields: FormField[];
  values?: Record<string, any>;
  submitLabel?: string;
}

const INPUT = 'w-full px-3 py-2.5 text-sm rounded-lg border border-surface-border bg-white focus:outline-none focus:border-brand-400 transition-colors placeholder:text-ink-400';

@Component({
  selector: 'app-form-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatIconModule],
  template: `
    <div class="w-[min(520px,92vw)]">
      <div class="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-surface-border">
        <div class="flex items-center gap-3 min-w-0">
          @if (data.icon) {
            <div class="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><mat-icon>{{ data.icon }}</mat-icon></div>
          }
          <div class="min-w-0">
            <h2 class="text-base font-bold text-ink-900">{{ data.title }}</h2>
            @if (data.subtitle) { <p class="text-xs text-ink-400 mt-0.5">{{ data.subtitle }}</p> }
          </div>
        </div>
        <button type="button" class="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:bg-surface-subtle hover:text-ink-700 shrink-0" (click)="ref.close()"><mat-icon>close</mat-icon></button>
      </div>

      <form #f="ngForm" (ngSubmit)="submit()" class="px-6 py-5 flex flex-col gap-4 max-h-[65vh] overflow-y-auto">
        @for (fld of data.fields; track fld.key) {
          <div>
            <label class="text-[13px] font-medium text-ink-700 block mb-1.5">{{ fld.label }} @if (fld.required) { <span class="text-status-red">*</span> }</label>
            @switch (fld.type) {
              @case ('select') {
                <div class="relative">
                  <select [name]="fld.key" [(ngModel)]="model[fld.key]" [required]="!!fld.required" [class]="input + ' pr-9 appearance-none'">
                    <option value="" disabled>{{ fld.placeholder || 'Select…' }}</option>
                    @for (o of fld.options || []; track optValue(o)) { <option [value]="optValue(o)">{{ optLabel(o) }}</option> }
                  </select>
                  <mat-icon class="!text-lg !text-ink-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">expand_more</mat-icon>
                </div>
              }
              @case ('textarea') {
                <textarea [name]="fld.key" [(ngModel)]="model[fld.key]" [required]="!!fld.required" rows="3" [placeholder]="fld.placeholder || ''" [class]="input + ' resize-y'"></textarea>
              }
              @default {
                <input [name]="fld.key" [type]="fld.type || 'text'" [(ngModel)]="model[fld.key]" [required]="!!fld.required" [placeholder]="fld.placeholder || ''" [attr.min]="fld.min" [attr.max]="fld.max" [class]="input" />
              }
            }
            @if (fld.hint) { <p class="text-[11px] text-ink-400 mt-1">{{ fld.hint }}</p> }
          </div>
        }
      </form>

      <div class="flex items-center justify-end gap-2 px-6 py-4 border-t border-surface-border bg-surface-subtle">
        <button type="button" class="px-4 py-2 text-sm font-semibold rounded-lg text-ink-600 hover:bg-white border border-transparent hover:border-surface-border transition-colors" (click)="ref.close()">Cancel</button>
        <button type="button" class="px-4 py-2 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors" [disabled]="!f.valid" (click)="submit()">{{ data.submitLabel || 'Save' }}</button>
      </div>
    </div>
  `,
})
export class FormDialogComponent {
  input = INPUT;
  model: Record<string, any> = {};

  constructor(@Inject(MAT_DIALOG_DATA) public data: FormDialogData, public ref: MatDialogRef<FormDialogComponent>) {
    for (const f of data.fields) this.model[f.key] = data.values?.[f.key] ?? (f.type === 'number' ? null : '');
  }

  optValue(o: string | { value: string; label: string }) { return typeof o === 'string' ? o : o.value; }
  optLabel(o: string | { value: string; label: string }) { return typeof o === 'string' ? o : o.label; }

  submit() {
    const missing = this.data.fields.some((f) => f.required && (this.model[f.key] === '' || this.model[f.key] === null || this.model[f.key] === undefined));
    if (!missing) this.ref.close(this.model);
  }
}

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  icon?: string;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule],
  template: `
    <div class="w-[min(420px,92vw)]">
      <div class="flex items-start gap-3 px-6 pt-5 pb-4">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" [class]="data.danger ? 'bg-red-50 text-status-red' : 'bg-brand-50 text-brand-600'"><mat-icon>{{ data.icon || (data.danger ? 'warning' : 'help_outline') }}</mat-icon></div>
        <div>
          <h2 class="text-base font-bold text-ink-900">{{ data.title }}</h2>
          <p class="text-[13px] text-ink-500 mt-1">{{ data.message }}</p>
        </div>
      </div>
      <div class="flex items-center justify-end gap-2 px-6 py-4 border-t border-surface-border bg-surface-subtle">
        <button type="button" class="px-4 py-2 text-sm font-semibold rounded-lg text-ink-600 hover:bg-white border border-transparent hover:border-surface-border transition-colors" (click)="ref.close(false)">Cancel</button>
        <button type="button" class="px-4 py-2 text-sm font-semibold rounded-lg text-white transition-colors" [class]="data.danger ? 'bg-status-red hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'" (click)="ref.close(true)">{{ data.confirmLabel || 'Confirm' }}</button>
      </div>
    </div>
  `,
})
export class ConfirmDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData, public ref: MatDialogRef<ConfirmDialogComponent>) {}
}
