import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { ConfirmDialogComponent, ConfirmDialogData, FormDialogComponent, FormDialogData } from '../components/form-dialog/form-dialog.component';
import { CrcStore } from '../../core/services/crc-store.service';

@Injectable({ providedIn: 'root' })
export class UiService {
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private store = inject(CrcStore);

  form(data: FormDialogData): Promise<Record<string, any> | undefined> {
    return firstValueFrom(this.dialog.open(FormDialogComponent, { data, panelClass: 'app-dialog-panel', autoFocus: 'first-tabbable' }).afterClosed());
  }

  async confirm(data: ConfirmDialogData): Promise<boolean> {
    return !!(await firstValueFrom(this.dialog.open(ConfirmDialogComponent, { data, panelClass: 'app-dialog-panel', autoFocus: false }).afterClosed()));
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
