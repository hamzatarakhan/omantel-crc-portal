import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { ConfirmDialogComponent, ConfirmDialogData, FormDialogComponent, FormDialogData } from '../components/form-dialog/form-dialog.component';
import { CrcStore } from '../../core/services/crc-store.service';
import { DIALOG_SIZE } from '../dialog-sizes';

@Injectable({ providedIn: 'root' })
export class UiService {
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private store = inject(CrcStore);

  form(data: FormDialogData): Promise<Record<string, any> | undefined> {
    return firstValueFrom(this.dialog.open(FormDialogComponent, { data, panelClass: 'app-dialog-panel', autoFocus: 'first-tabbable', ...DIALOG_SIZE.form }).afterClosed());
  }

  async confirm(data: ConfirmDialogData): Promise<boolean> {
    return !!(await firstValueFrom(this.dialog.open(ConfirmDialogComponent, { data, panelClass: 'app-dialog-panel', autoFocus: false, ...DIALOG_SIZE.confirm }).afterClosed()));
  }

  toast(message: string, duration = 3500) {
    this.snack.open(message, 'Dismiss', { duration });
  }

  /** Role gate: tells the user why an action is blocked instead of failing silently. */
  requires(permission: string): boolean {
    if (this.store.can(permission)) return true;
    this.toast(`Your role (${this.store.currentRole()}) does not have the "${permission}" permission.`, 4500);
    return false;
  }

  /** Downloads a small, valid PDF made from the given lines (the prototype's stand-in for an ERP document). */
  pdf(filename: string, title: string, lines: string[]) {
    const esc = (t: string) => t.replace(/[^\x20-\x7e]/g, '-').replace(/[\\()]/g, (ch) => '\\' + ch);
    const content = ['BT', '/F1 16 Tf', '50 790 Td', '22 TL', `(${esc(title)}) Tj`, '/F1 10 Tf', '16 TL', 'T*', ...lines.flatMap((l) => [`(${esc(l)}) Tj`, 'T*']), 'ET'].join('\n');
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];
    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [];
    objects.forEach((o, i) => {
      offsets.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    this.toast(`Downloaded ${filename}.`);
  }

  csv(filename: string, rows: Array<Record<string, any>>) {
    if (!rows.length) {
      this.toast('Nothing to export.');
      return;
    }
    const cols = Object.keys(rows[0]);
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const body = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.csv') ? filename : filename + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    this.toast(`Downloaded ${a.download} (${rows.length} rows).`);
  }
}
