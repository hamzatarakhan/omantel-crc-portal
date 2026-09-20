import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { StatusLevel } from '../../../core/models/status';

const LEVELS: Array<{ key: StatusLevel | 'all'; label: string }> = [
  { key: 'all', label: 'All' }, { key: 'normal', label: 'Optimal' }, { key: 'amber', label: 'Attention' }, { key: 'orange', label: 'Warning' }, { key: 'red', label: 'Poor' },
];
const RATING: Record<string, string> = { normal: 'Optimal', amber: 'Attention', orange: 'Warning', red: 'Poor' };

@Component({
  selector: 'app-performance-monitoring',
  standalone: true,
  imports: [CommonModule, MatIconModule, PageHeaderComponent, DataTableComponent, KpiCardComponent],
  template: `
    <app-page-header
      title="Performance Monitoring"
      subtitle="Attendance and productivity by agent, retrievable by vendor or resource name &middot; click a row to open the profile"
      [breadcrumbs]="[{ label: 'CSR Management', link: '/csr/directory' }, { label: 'Performance Monitoring' }]"
    ></app-page-header>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <app-kpi-card label="Avg. attendance" [value]="avg().attendance + '%'" icon="event_available" [level]="avg().attendance >= 90 ? 'normal' : 'amber'"></app-kpi-card>
      <app-kpi-card label="Avg. CSAT" [value]="avg().csat + '%'" icon="sentiment_satisfied" [level]="avg().csat >= 85 ? 'normal' : 'amber'"></app-kpi-card>
      <app-kpi-card label="Avg. resolution" [value]="avg().resolution + ' min'" icon="timer"></app-kpi-card>
      <app-kpi-card label="Needs attention" [value]="attention()" icon="warning" [level]="attention() ? 'orange' : 'normal'"></app-kpi-card>
    </div>

    <app-data-table title="Agent performance" [columns]="columns" [rows]="rows()" (rowClick)="open($event)">
      <div toolbar class="flex items-center gap-2 flex-wrap">
        <div class="flex items-center gap-1 bg-surface-subtle border border-surface-border rounded-lg p-0.5">
          @for (l of levels; track l.key) {
            <button
              (click)="level.set(l.key)"
              class="px-2.5 py-1 text-xs font-semibold rounded-md transition-colors"
              [class]="level() === l.key ? 'bg-white text-brand-700 border border-surface-border' : 'text-ink-500 hover:text-ink-900 border border-transparent'"
            >{{ l.label }}</button>
          }
        </div>
        <div class="relative">
          <select [value]="vendor()" (change)="vendor.set($any($event.target).value)" class="pl-3 pr-8 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 appearance-none focus:outline-none focus:border-brand-400">
            <option value="All">All vendors</option>
            <option>Infoline</option><option>Green Umbrella</option><option>OJT</option>
          </select>
          <mat-icon class="!text-base !text-ink-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">expand_more</mat-icon>
        </div>
      </div>
    </app-data-table>
  `,
})
export class PerformanceMonitoringComponent {
  private store = inject(CrcStore);
  private router = inject(Router);

  levels = LEVELS;
  level = signal<StatusLevel | 'all'>('all');
  vendor = signal('All');

  private all = computed(() => this.store.performance());
  rows = computed(() =>
    this.all()
      .filter((p) => (this.level() === 'all' || p.level === this.level()) && (this.vendor() === 'All' || p.vendor === this.vendor()))
      .map((p) => ({ ...p, avgCallResolutionMin: Math.round(p.avgCallResolutionMin * 10) / 10, rating: RATING[p.level] })),
  );
  attention = computed(() => this.all().filter((p) => p.level === 'orange' || p.level === 'red').length);
  avg = computed(() => {
    const a = this.all();
    const n = a.length || 1;
    return {
      attendance: Math.round(a.reduce((s, p) => s + p.attendancePct, 0) / n),
      csat: Math.round(a.reduce((s, p) => s + p.csatPct, 0) / n),
      resolution: (a.reduce((s, p) => s + p.avgCallResolutionMin, 0) / n).toFixed(1),
    };
  });

  columns: TableColumn<any>[] = [
    { key: 'agentName', label: 'Agent' },
    { key: 'queue', label: 'Queue' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'attendancePct', label: 'Attendance %', type: 'number', align: 'right' },
    { key: 'avgCallResolutionMin', label: 'Avg. Resolution (min)', type: 'number', align: 'right' },
    { key: 'csatPct', label: 'CSAT %', type: 'number', align: 'right' },
    { key: 'rating', label: 'Rating', type: 'status', statusFn: (r) => ({ label: r.rating, level: r.level }) },
  ];

  open(row: { agentId: string }) {
    this.router.navigate(['/csr/directory', row.agentId]);
  }
}
