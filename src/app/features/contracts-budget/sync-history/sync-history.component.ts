import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { SyncRun } from '../../../core/models/domain';

const FILTERS = ['All', 'Completed', 'No Changes', 'Failed'] as const;

@Component({
  selector: 'app-sync-history',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, PageHeaderComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Synchronization History"
      subtitle="Every automated and manual ERP sync, with record counts and errors"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Sync History' }]"
    >
      <button mat-flat-button color="primary" (click)="runSync()" [disabled]="syncing()">
        <mat-icon class="!text-base !mr-1" [class.animate-spin]="syncing()">sync</mat-icon>{{ syncing() ? 'Syncing…' : 'Run full sync now' }}
      </button>
    </app-page-header>

    <app-data-table title="Sync runs" [columns]="columns" [rows]="rows()">
      <div toolbar class="flex items-center gap-1 bg-surface-subtle border border-surface-border rounded-lg p-0.5">
        @for (f of filters; track f) {
          <button
            (click)="filter.set(f)"
            class="px-2.5 py-1 text-xs font-semibold rounded-md transition-colors"
            [class]="filter() === f ? 'bg-white text-brand-700 border border-surface-border' : 'text-ink-500 hover:text-ink-900 border border-transparent'"
          >{{ f }}</button>
        }
      </div>
    </app-data-table>
  `,
})
export class SyncHistoryComponent {
  private store = inject(CrcStore);
  private ui = inject(UiService);

  filters = FILTERS;
  filter = signal<(typeof FILTERS)[number]>('All');
  syncing = signal(false);
  rows = computed(() => this.store.syncRuns().filter((r) => this.filter() === 'All' || r.status === this.filter()));

  columns: TableColumn<SyncRun>[] = [
    { key: 'type', label: 'Type' },
    { key: 'startedAt', label: 'Started', type: 'date' },
    { key: 'finishedAt', label: 'Finished', type: 'date' },
    { key: 'initiatedBy', label: 'Initiated By' },
    { key: 'processed', label: 'Processed', type: 'number', align: 'right' },
    { key: 'created', label: 'Created', type: 'number', align: 'right' },
    { key: 'updated', label: 'Updated', type: 'number', align: 'right' },
    { key: 'rejected', label: 'Rejected', type: 'number', align: 'right' },
    {
      key: 'status', label: 'Status', type: 'status',
      statusFn: (r) => ({ label: r.status, level: r.status === 'Failed' ? 'red' : r.status === 'No Changes' ? 'neutral' : 'normal' }),
    },
  ];

  runSync() {
    if (!this.ui.requires('Manual Contract Sync')) return;
    this.syncing.set(true);
    setTimeout(() => {
      const run = this.store.runFullSync();
      this.syncing.set(false);
      this.filter.set('All');
      this.ui.toast(run.updated ? `Sync complete — ${run.updated} contract${run.updated > 1 ? 's' : ''} updated.` : 'Sync complete — no changes found.');
    }, 900);
  }
}
