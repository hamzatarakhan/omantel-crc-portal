import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { MockDataService } from '../../../core/services/mock-data.service';
import { PerformanceRecord } from '../../../core/models/domain';

@Component({
  selector: 'app-performance-monitoring',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent],
  template: `
    <app-page-header
      title="Performance Monitoring"
      subtitle="Attendance and productivity by agent, retrievable by vendor or resource name"
      [breadcrumbs]="[{ label: 'CSR Management', link: '/csr/directory' }, { label: 'Performance Monitoring' }]"
    ></app-page-header>

    <div class="surface-card overflow-hidden">
      <div class="overflow-x-auto">
        <div class="min-w-[560px]">
          <div class="grid grid-cols-5 bg-surface-subtle text-[11px] font-bold text-ink-500 uppercase tracking-wider">
            <div class="px-4 py-3">Agent</div>
            <div class="px-4 py-3">Queue</div>
            <div class="px-4 py-3 text-right">Attendance</div>
            <div class="px-4 py-3 text-right">Avg. Resolution</div>
            <div class="px-4 py-3 text-right">CSAT</div>
          </div>
          @for (r of records; track r.agentName) {
            <div class="grid grid-cols-5 border-t border-surface-border text-sm items-center" [style.background]="cellBg(r.level)">
              <div class="px-4 py-2.5 font-semibold text-ink-900 truncate">{{ r.agentName }}</div>
              <div class="px-4 py-2.5 text-ink-500 truncate">{{ r.queue }}</div>
              <div class="px-4 py-2.5 text-right text-ink-700">{{ r.attendancePct }}%</div>
              <div class="px-4 py-2.5 text-right text-ink-700">{{ r.avgCallResolutionMin }} min</div>
              <div class="px-4 py-2.5 text-right text-ink-700">{{ r.csatPct }}%</div>
            </div>
          }
        </div>
      </div>
    </div>
    <div class="flex items-center flex-wrap gap-4 mt-4 text-xs font-medium text-ink-500">
      <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full inline-block bg-status-normal"></span>Optimal</span>
      <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full inline-block bg-status-amber"></span>Attention</span>
      <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full inline-block bg-status-orange"></span>Warning</span>
      <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full inline-block bg-status-red"></span>Poor</span>
    </div>
  `,
})
export class PerformanceMonitoringComponent {
  private data = inject(MockDataService);
  records: PerformanceRecord[] = this.data.getPerformanceRecords();

  cellBg(level: string): string {
    const map: Record<string, string> = { normal: '#0e9f6e14', amber: '#e3a00814', orange: '#ea6e0014', red: '#e0242414' };
    return map[level] || 'transparent';
  }
}
