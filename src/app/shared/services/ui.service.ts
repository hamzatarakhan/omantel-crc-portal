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
    const sheetXml = (rows: Array<Record<string, any>>) => {
      const cols = Object.keys(rows[0]);
      const data = [cols, ...rows.map((r) => cols.map((k) => r[k]))].map((row, ri) => `<row r="${ri + 1}">${row.map((v, ci) => xCell(v, ri + 1, ci)).join('')}</row>`).join('');
      return `${XML_HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${data}</sheetData></worksheet>`;
    };
    const name = this.packXlsx(filename, live.map((sh) => ({ name: sh.name, xml: sheetXml(sh.rows) })));
    const count = live.reduce((n, sh) => n + sh.rows.length, 0);
    if (log) {
      this.store.log('Data Exported', name, `${count} row(s) exported as Excel.`);
      this.toast(`Downloaded ${name} (${count} rows).`);
    }
    return name;
  }

  /** A formatted workbook: styled cells, real dates, merged cells, column widths and frozen panes. */
  xlsxStyled(filename: string, sheets: XSheet[]): string {
    const sheetXml = (sh: XSheet) => {
      const cols = sh.widths?.length ? `<cols>${sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
      const pane = sh.freeze ? `<pane xSplit="${sh.freeze.col}" ySplit="${sh.freeze.row}" topLeftCell="${colName(sh.freeze.col)}${sh.freeze.row + 1}" activePane="bottomRight" state="frozen"/>` : '';
      const data = sh.rows.map((row, ri) => {
        const r = ri + 1, ht = sh.heights?.[r];
        return `<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${row.map((c, ci) => (c.v === null && !c.s ? '' : xCell(c.date && typeof c.v === 'string' ? excelDate(c.v) : c.v, r, ci, X_STYLE[c.s ?? 'text']))).join('')}</row>`;
      }).join('');
      const merges = sh.merges?.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
      return `${XML_HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView></sheetViews>${cols}<sheetData>${data}</sheetData>${merges}</worksheet>`;
    };
    return this.packXlsx(filename, sheets.map((sh) => ({ name: sh.name, xml: sheetXml(sh) })), X_STYLES_XML);
  }

  private packXlsx(filename: string, sheets: Array<{ name: string; xml: string }>, styles?: string): string {
    const files: Record<string, Uint8Array> = {
      '[Content_Types].xml': strToU8(`${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${styles ? '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' : ''}${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
      '_rels/.rels': strToU8(`${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
      'xl/workbook.xml': strToU8(`${XML_HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sh, i) => `<sheet name="${xmlEsc(sh.name.replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
      'xl/_rels/workbook.xml.rels': strToU8(`${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}${styles ? `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` : ''}</Relationships>`),
    };
    if (styles) files['xl/styles.xml'] = strToU8(styles);
    sheets.forEach((sh, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sh.xml)));
    const url = URL.createObjectURL(new Blob([zipSync(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.xlsx') ? filename : filename + '.xlsx';
    link.click();
    URL.revokeObjectURL(url);
    return link.download;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const xmlEsc = (v: string) => v.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[ch]);
const colName = (i: number) => (i >= 26 ? String.fromCharCode(64 + Math.floor(i / 26)) : '') + String.fromCharCode(65 + (i % 26));
const excelDate = (iso: string) => (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86400000;
const xCell = (v: any, r: number, c: number, s?: number) => {
  const ref = colName(c) + r, st = s ? ` s="${s}"` : '';
  if (v === null || v === undefined || v === '') return `<c r="${ref}"${st}/>`;
  return typeof v === 'number' && isFinite(v) ? `<c r="${ref}"${st}><v>${v}</v></c>` : `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(String(v))}</t></is></c>`;
};

/** Cell looks for formatted exports, modelled on Omantel's own accrual sheet (gold Bookman header, thin borders, 3-decimal accounting amounts). */
export type XStyle = 'title' | 'note' | 'head' | 'headDate' | 'text' | 'group' | 'money' | 'moneyF' | 'moneyA' | 'int' | 'subText' | 'subMoney' | 'totText' | 'totMoney' | 'ok' | 'short' | 'none' | 'key' | 'plain';
export interface XCell { v: string | number | null; s?: XStyle; /** v is an ISO date: written as a real Excel date. */ date?: boolean }
export interface XSheet { name: string; rows: XCell[][]; widths?: number[]; merges?: string[]; freeze?: { row: number; col: number }; heights?: Record<number, number> }

const X_STYLE: Record<XStyle, number> = { title: 1, note: 2, head: 3, headDate: 4, text: 5, group: 6, money: 7, moneyF: 8, moneyA: 9, int: 10, subText: 11, subMoney: 12, totText: 13, totMoney: 14, ok: 15, short: 16, none: 17, key: 18, plain: 19 };
const X_STYLES_XML = (() => {
  const money = '_(* #,##0.000_);[Red]_(* \\(#,##0.000\\);_(* &quot;-&quot;??_);_(@_)';
  const font = (o: { b?: boolean; i?: boolean; sz?: number; color?: string; name?: string }) => `<font>${o.b ? '<b/>' : ''}${o.i ? '<i/>' : ''}<sz val="${o.sz ?? 11}"/>${o.color ? `<color rgb="FF${o.color}"/>` : ''}<name val="${o.name ?? 'Aptos Narrow'}"/></font>`;
  const fonts = [font({}), font({ b: true, sz: 10, name: 'Bookman Old Style' }), font({ b: true }), font({ color: '1F4E79' }), font({ b: true, color: '006100' }), font({ b: true, color: '9C0006' }), font({ b: true, sz: 14, name: 'Bookman Old Style' }), font({ i: true, sz: 10, color: '595959' }), font({ color: '9C5700' }), font({ color: '595959' })];
  const fill = (rgb: string) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>', ...['FFC000', 'DDEBF7', 'FFF2CC', 'F2F2F2', 'FFE699', 'C6EFCE', 'FFC7CE', 'EDEDED'].map(fill)];
  const side = (n: string) => `<${n} style="thin"><color rgb="FFA6A6A6"/></${n}>`;
  const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>', `<border>${side('left')}${side('right')}${side('top')}${side('bottom')}<diagonal/></border>`];
  // [font, fill, border, numFmt, horizontal, vertical, wrap]
  const xf = (f: number, fl: number, b: number, n: number, h?: string, v = 'center', wrap = false) => `<xf numFmtId="${n}" fontId="${f}" fillId="${fl}" borderId="${b}" xfId="0"${n ? ' applyNumberFormat="1"' : ''} applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment${h ? ` horizontal="${h}"` : ''} vertical="${v}"${wrap ? ' wrapText="1"' : ''}/></xf>`;
  const xfs = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    xf(6, 0, 0, 0, 'left'), xf(7, 0, 0, 0, 'left', 'center', false), xf(1, 2, 1, 0, 'center', 'center', true), xf(1, 2, 1, 165, 'center', 'center', true),
    xf(0, 0, 1, 0, 'left', 'center', true), xf(2, 0, 1, 0, 'left', 'center', true), xf(0, 0, 1, 164), xf(3, 3, 1, 164), xf(8, 4, 1, 164), xf(0, 0, 1, 1, 'center'),
    xf(2, 5, 1, 0, 'left', 'center', true), xf(2, 5, 1, 164), xf(2, 6, 1, 0, 'left', 'center', true), xf(2, 6, 1, 164),
    xf(4, 7, 1, 0, 'left', 'center', true), xf(5, 8, 1, 0, 'left', 'center', true), xf(9, 9, 1, 0, 'left', 'center', true), xf(2, 0, 1, 0, 'left', 'top', true), xf(0, 0, 1, 0, 'left', 'top', true),
  ];
  return `${XML_HEAD}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="${money}"/><numFmt numFmtId="165" formatCode="[$-409]mmm\\-yy;@"/></numFmts><fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
})();
