import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MONTH_NAMES, OutsourcingLine } from '../../../core/services/budget-cycle.service';

export interface MonthlyData { line: OutsourcingLine; editable: boolean }

/** Monthly view of one outsourcing line: head count, salary, incentive, overtime, OJT and the monthly total (BR-OUT-009). */
@Component({
  selector: 'app-monthly-breakdown-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule],
  template: `
    <div class="w-full">
      <div class="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-surface-border">
        <div class="min-w-0"><h2 class="text-base font-bold text-ink-900">Monthly breakdown</h2><p class="text-xs text-ink-400 mt-0.5">{{ data.line.vendor }} · {{ data.line.category }}</p></div>
        <button class="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:bg-surface-subtle" (click)="ref.close()"><mat-icon>close</mat-icon></button>
      </div>
      <div class="px-6 py-4 max-h-[68vh] overflow-auto">
        <table class="crc-table w-full text-sm">
          <thead><tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide">
            <th class="px-3 py-2 font-medium">Month</th><th class="px-3 py-2 font-medium text-right">Head count</th><th class="px-3 py-2 font-medium text-right">Salary</th><th class="px-3 py-2 font-medium text-right">Incentive</th><th class="px-3 py-2 font-medium text-right">Overtime</th><th class="px-3 py-2 font-medium text-right">OJT</th><th class="px-3 py-2 font-medium text-right">Monthly total</th>
          </tr></thead>
          <tbody>
            @for (m of rows; track m.name) {
              <tr class="border-t border-surface-border"><td class="px-3 py-1.5 font-medium text-ink-700">{{ m.name }}</td><td class="px-3 py-1.5 text-right">{{ m.hc }}</td><td class="px-3 py-1.5 text-right">{{ m.salary | number:'1.0-0' }}</td><td class="px-3 py-1.5 text-right">{{ m.incentive | number:'1.0-0' }}</td><td class="px-3 py-1.5 text-right">{{ m.overtime | number:'1.0-0' }}</td><td class="px-3 py-1.5 text-right">{{ m.ojt | number:'1.0-0' }}</td><td class="px-3 py-1.5 text-right font-semibold">{{ m.total | number:'1.0-0' }}</td></tr>
            }
          </tbody>
          <tfoot><tr class="border-t-2 border-surface-border font-semibold"><td class="px-3 py-2">Annual total</td><td class="px-3 py-2 text-right">—</td><td class="px-3 py-2 text-right">{{ sum('salary') | number:'1.0-0' }}</td><td class="px-3 py-2 text-right">{{ sum('incentive') | number:'1.0-0' }}</td><td class="px-3 py-2 text-right">{{ sum('overtime') | number:'1.0-0' }}</td><td class="px-3 py-2 text-right">{{ sum('ojt') | number:'1.0-0' }}</td><td class="px-3 py-2 text-right text-brand-700">{{ sum('total') | number:'1.0-0' }}</td></tr></tfoot>
        </table>
        <p class="text-xs text-ink-400 mt-3">Amounts in OMR. Head count can change month by month for recruitment, resignation, replacement or expansion.</p>
      </div>
      <div class="flex items-center justify-end gap-2 px-6 py-4 border-t border-surface-border bg-surface-subtle">
        <button class="px-4 py-2 text-sm font-semibold rounded-lg text-ink-600 hover:bg-white border border-transparent hover:border-surface-border" (click)="ref.close()">Close</button>
        @if (data.editable) { <button class="px-4 py-2 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700" (click)="ref.close('edit')">Edit head count by month</button> }
      </div>
    </div>
  `,
})
export class MonthlyBreakdownDialogComponent {
  rows: Array<{ name: string; hc: number; salary: number; incentive: number; overtime: number; ojt: number; total: number }>;

  constructor(@Inject(MAT_DIALOG_DATA) public data: MonthlyData, public ref: MatDialogRef<MonthlyBreakdownDialogComponent>) {
    const l = data.line;
    this.rows = MONTH_NAMES.map((name, i) => {
      const salary = l.monthlyHC[i] * l.salary;
      const incentive = l.incentive / 12, overtime = l.overtime / 12, ojt = (l.ojt + l.other) / 12;
      return { name, hc: l.monthlyHC[i], salary, incentive, overtime, ojt, total: salary + incentive + overtime + ojt };
    });
  }

  sum(k: 'salary' | 'incentive' | 'overtime' | 'ojt' | 'total') { return this.rows.reduce((s, r) => s + r[k], 0); }
}
