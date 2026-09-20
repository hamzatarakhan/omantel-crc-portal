import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { CrcStore } from '../../../core/services/crc-store.service';

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, MatIconModule, PageHeaderComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Audit Log"
      subtitle="Every synchronization, approval, notification, escalation and monitoring action across CRC — including what you do in this demo"
      [breadcrumbs]="[{ label: 'Administration' }, { label: 'Audit Log' }]"
    ></app-page-header>

    <app-data-table title="Activity" [columns]="columns" [rows]="rows()" [exportable]="store.can('Export Contract Data') || store.currentRole() === 'System Admin'">
      <div toolbar class="flex items-center gap-2 flex-wrap">
        <div class="flex items-center gap-1 bg-surface-subtle border border-surface-border rounded-lg p-0.5">
          @for (r of results; track r) {
            <button
              (click)="result.set(r)"
              class="px-2.5 py-1 text-xs font-semibold rounded-md transition-colors"
              [class]="result() === r ? 'bg-white text-brand-700 border border-surface-border' : 'text-ink-500 hover:text-ink-900 border border-transparent'"
            >{{ r }}</button>
          }
        </div>
        <div class="relative">
          <select [value]="type()" (change)="type.set($any($event.target).value)" class="pl-3 pr-8 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 appearance-none focus:outline-none focus:border-brand-400 max-w-[190px]">
            <option value="All">All activity types</option>
            @for (t of types(); track t) { <option [value]="t">{{ t }}</option> }
          </select>
          <mat-icon class="!text-base !text-ink-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">expand_more</mat-icon>
        </div>
      </div>
    </app-data-table>
  `,
})
export class AuditLogComponent {
  store = inject(CrcStore);

  results = ['All', 'Success', 'Failed'];
  result = signal('All');
  type = signal('All');
  types = computed(() => [...new Set(this.store.audit().map((a) => a.activityType))].sort());

  rows = computed(() =>
    this.store.audit()
      .filter((a) => (this.result() === 'All' || a.result === this.result()) && (this.type() === 'All' || a.activityType === this.type()))
      .map((a) => ({ ...a, when: new Date(a.timestamp).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) })),
  );

  columns: TableColumn<any>[] = [
    { key: 'when', label: 'Timestamp' },
    { key: 'actor', label: 'Actor' },
    { key: 'activityType', label: 'Activity Type' },
    { key: 'reference', label: 'Reference' },
    { key: 'erpReference', label: 'ERP reference' },
    { key: 'syncType', label: 'Sync type' },
    { key: 'previousValue', label: 'Previous value' },
    { key: 'newValue', label: 'New value' },
    { key: 'result', label: 'Result', type: 'status', statusFn: (r) => ({ label: r.result, level: r.result === 'Success' ? 'normal' : 'red' }) },
    { key: 'details', label: 'Details' },
  ];
}
