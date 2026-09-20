import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { CrcStore } from '../../../core/services/crc-store.service';

const FILTERS = ['All', 'Completed', 'No Changes', 'Failed'] as const;
const TYPES = ['All', 'Automated', 'Manual'] as const;

@Component({
  selector: 'app-sync-history',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Synchronization Run History"
      subtitle="Every automated and manual ERP synchronization, with record counts and failures"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Synchronization' }, { label: 'Run History' }]"
    ></app-page-header>

    <app-data-table title="Synchronization runs" [columns]="columns" [rows]="rows()" [exportable]="store.can('Export Contract Data')" [searchKeys]="['errorMessage']">
      <div toolbar class="flex items-center gap-2 flex-wrap">
        <div class="flex items-center gap-1 bg-surface-subtle border border-surface-border rounded-lg p-0.5">
          @for (t of types; track t) {
            <button (click)="type.set(t)" class="px-2.5 py-1 text-xs font-semibold rounded-md transition-colors" [class]="type() === t ? 'bg-white text-brand-700 border border-surface-border' : 'text-ink-500 hover:text-ink-900 border border-transparent'">{{ t }}</button>
          }
        </div>
        <div class="flex items-center gap-1 bg-surface-subtle border border-surface-border rounded-lg p-0.5">
          @for (f of filters; track f) {
            <button (click)="filter.set(f)" class="px-2.5 py-1 text-xs font-semibold rounded-md transition-colors" [class]="filter() === f ? 'bg-white text-brand-700 border border-surface-border' : 'text-ink-500 hover:text-ink-900 border border-transparent'">{{ f }}</button>
          }
        </div>
      </div>
    </app-data-table>
    <p class="text-xs text-ink-400 mt-3">Records are matched on the ERP reference, so repeated runs never create duplicates. A failed run keeps the last valid data and never marks existing contracts as expired or missing.</p>
  `,
})
export class SyncHistoryComponent {
  store = inject(CrcStore);

  filters = FILTERS;
  types = TYPES;
  filter = signal<(typeof FILTERS)[number]>('All');
  type = signal<(typeof TYPES)[number]>('All');

  rows = computed(() => this.store.syncRuns()
    .filter((r) => (this.filter() === 'All' || r.status === this.filter()) && (this.type() === 'All' || r.type === this.type()))
    .map((r) => ({ ...r, contract: r.contractReference ?? 'All contracts', errors: r.errors ?? 0, error: r.errorMessage ?? '' })));

  columns: TableColumn<any>[] = [
    { key: 'type', label: 'Synchronization type' },
    { key: 'startedAt', label: 'Start', type: 'date' },
    { key: 'finishedAt', label: 'End', type: 'date' },
    { key: 'initiatedBy', label: 'Initiated by' },
    { key: 'contract', label: 'Contract reference' },
    { key: 'processed', label: 'Processed', type: 'number', align: 'right' },
    { key: 'created', label: 'Created', type: 'number', align: 'right' },
    { key: 'updated', label: 'Updated', type: 'number', align: 'right' },
    { key: 'rejected', label: 'Rejected', type: 'number', align: 'right' },
    { key: 'errors', label: 'Errors', type: 'number', align: 'right' },
    { key: 'status', label: 'Status', type: 'status', statusFn: (r) => ({ label: r.status, level: r.status === 'Failed' ? 'red' : r.status === 'No Changes' ? 'neutral' : 'normal' }) },
    { key: 'error', label: 'Error details' },
  ];
}
