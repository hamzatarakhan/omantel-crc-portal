import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { strToU8, zipSync } from 'fflate';
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
  pdf(filename: string, title: string, lines: string[], mode: 'download' | 'view' = 'download') {
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
    if (mode === 'view') {
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      this.toast(`Opened ${filename}.`);
      return;
    }
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
    this.store.log('Data Exported', a.download, `${rows.length} row(s) exported as CSV.`);
    this.toast(`Downloaded ${a.download} (${rows.length} rows).`);
  }

  /** Writes a real .xlsx workbook (one sheet) — numbers stay numbers so Excel can total and filter them. */
  xlsx(filename: string, rows: Array<Record<string, any>>, sheet = 'Data', log = true) {
    return this.xlsxSheets(filename, [{ name: sheet, rows }], log);
  }

  /** A workbook with several sheets, e.g. a summary sheet plus one sheet per section. Returns the file name, or undefined when there is nothing to write. */
  xlsxSheets(filename: string, sheets: Array<{ name: string; rows: Array<Record<string, any>> }>, log = true): string | undefined {
    const live = sheets.filter((sh) => sh.rows.length);
    if (!live.length) {
      this.toast('Nothing to export.');
      return undefined;
    }
    const xml = (v: string) => v.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[ch]);
    const colName = (i: number) => (i >= 26 ? String.fromCharCode(64 + Math.floor(i / 26)) : '') + String.fromCharCode(65 + (i % 26));
    const cell = (v: any, r: number, c: number) => {
      const ref = colName(c) + r;
      return typeof v === 'number' && isFinite(v) ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(String(v ?? ''))}</t></is></c>`;
    };
    const sheetXml = (rows: Array<Record<string, any>>) => {
      const cols = Object.keys(rows[0]);
      const data = [cols, ...rows.map((r) => cols.map((k) => r[k]))].map((row, ri) => `<row r="${ri + 1}">${row.map((v, ci) => cell(v, ri + 1, ci)).join('')}</row>`).join('');
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${data}</sheetData></worksheet>`;
    };
    const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const files: Record<string, Uint8Array> = {
      '[Content_Types].xml': strToU8(`${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${live.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
      '_rels/.rels': strToU8(`${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
      'xl/workbook.xml': strToU8(`${head}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${live.map((sh, i) => `<sheet name="${xml(sh.name.replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
      'xl/_rels/workbook.xml.rels': strToU8(`${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${live.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`),
    };
    live.forEach((sh, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(sh.rows))));
    const url = URL.createObjectURL(new Blob([zipSync(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.xlsx') ? filename : filename + '.xlsx';
    link.click();
    URL.revokeObjectURL(url);
    const count = live.reduce((n, sh) => n + sh.rows.length, 0);
    if (log) {
      this.store.log('Data Exported', link.download, `${count} row(s) exported as Excel.`);
      this.toast(`Downloaded ${link.download} (${count} rows).`);
    }
    return link.download;
  }
}
