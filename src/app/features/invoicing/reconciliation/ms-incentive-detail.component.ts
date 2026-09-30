import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MsIncentiveImport } from '../../../core/services/ms-incentive-import';

/** Read-only deep-dive for one imported Manage Service Incentive file — sales incentive by category, exactly as columned in the vendor's own workbook. */
@Component({
  selector: 'app-ms-incentive-detail',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (data(); as d) {
      <div class="surface-card overflow-hidden mb-4">
        <div class="px-4 py-3.5 border-b border-surface-border flex items-center justify-between">
          <h3 class="text-[13.5px] font-bold text-ink-900">Sales incentive by category</h3>
          <span class="text-xs font-semibold text-brand-700">{{ d.total | number:'1.2-2' }} OMR total</span>
        </div>
        <table class="crc-table w-full">
          <thead><tr class="text-left"><th>Category</th><th class="text-right">Target</th><th class="text-right">Actual</th><th class="text-right">Achievement</th><th>Status</th><th class="text-right">Incentive (OMR)</th></tr></thead>
          <tbody>
            @for (r of d.rows; track r.category) {
              <tr>
                <td class="font-semibold text-ink-900">{{ r.category }}</td>
                <td class="text-right tabular-nums">{{ r.target | number:'1.0-0' }}</td>
                <td class="text-right tabular-nums">{{ r.actual | number:'1.0-0' }}</td>
                <td class="text-right tabular-nums">{{ r.achievement | percent:'1.0-1' }}</td>
                <td [class.text-status-green]="r.status.toLowerCase().includes('meets') || r.status.includes('✓')" [class.text-status-red]="r.status.toLowerCase().includes('below') || r.status.toLowerCase().includes('fail')">{{ r.status }}</td>
                <td class="text-right tabular-nums font-semibold text-ink-900">{{ r.incentive | number:'1.2-2' }}</td>
              </tr>
            }
          </tbody>
          <tfoot><tr class="font-bold"><td colspan="5" class="!text-ink-900">Total</td><td class="text-right !text-brand-700">{{ d.total | number:'1.2-2' }}</td></tr></tfoot>
        </table>
      </div>
    }
  `,
})
export class MsIncentiveDetailComponent {
  data = input.required<MsIncentiveImport>();
}
