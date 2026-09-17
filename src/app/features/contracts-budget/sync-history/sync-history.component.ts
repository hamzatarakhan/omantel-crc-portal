import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';

interface SyncRun {
  id: string;
  type: 'Automated' | 'Manual';
  startedAt: string;
  finishedAt: string;
  initiatedBy: string;
  processed: number;
  created: number;
  updated: number;
  rejected: number;
  status: 'Completed' | 'Failed' | 'No Changes';
}

@Component({
  selector: 'app-sync-history',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Synchronization History"
      subtitle="Every automated and manual ERP sync, with record counts and errors"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Sync History' }]"
    ></app-page-header>
    <app-data-table [columns]="columns" [rows]="rows"></app-data-table>
  `,
})
export class SyncHistoryComponent {
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

  rows: SyncRun[] = [
    { id: '1', type: 'Automated', startedAt: '2026-09-17T02:00:00', finishedAt: '2026-09-17T02:04:00', initiatedBy: 'System Scheduler', processed: 214, created: 2, updated: 11, rejected: 0, status: 'Completed' },
    { id: '2', type: 'Manual', startedAt: '2026-09-16T14:22:00', finishedAt: '2026-09-16T14:22:40', initiatedBy: 'Hamza Tarkan', processed: 1, created: 0, updated: 0, rejected: 0, status: 'No Changes' },
    { id: '3', type: 'Automated', startedAt: '2026-09-16T02:00:00', finishedAt: '2026-09-16T02:03:00', initiatedBy: 'System Scheduler', processed: 214, created: 0, updated: 4, rejected: 0, status: 'Completed' },
    { id: '4', type: 'Automated', startedAt: '2026-09-15T02:00:00', finishedAt: '2026-09-15T02:01:10', initiatedBy: 'System Scheduler', processed: 0, created: 0, updated: 0, rejected: 0, status: 'Failed' },
  ];
}
