import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { ContractOps } from '../../../core/services/contract-ops.service';

@Component({
  selector: 'app-sync-overview',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, PageHeaderComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Synchronization Overview"
      subtitle="The state of the automated ERP synchronization at a glance"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Synchronization' }, { label: 'Overview' }]"
    >
      <span class="status-chip" [class.status-chip--normal]="healthy()" [class.status-chip--red]="!healthy()">{{ healthy() ? 'Automated sync healthy' : 'Last automated sync failed' }}</span>
    </app-page-header>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Automated synchronization</div><div class="text-sm font-semibold mt-0.5" [class]="healthy() ? 'text-status-normal' : 'text-status-red'">{{ ops.syncConfig().enabled ? (healthy() ? 'Running · ' + ops.syncConfig().frequency.toLowerCase() : 'Failed — last data retained') : 'Switched off' }}</div></div>
      <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Last synchronization</div><div class="text-sm font-semibold text-ink-900 mt-0.5">{{ lastSync() }}</div></div>
      <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Next scheduled synchronization</div><div class="text-sm font-semibold text-ink-900 mt-0.5">{{ nextRun() }}</div></div>
      <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Open errors</div><div class="text-sm font-semibold mt-0.5" [class]="openErrors() ? 'text-status-red' : 'text-status-normal'">{{ openErrors() }} open · {{ ops.errorLog().length }} logged</div></div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <a routerLink="/contracts-budget/sync-history" class="surface-card px-4 py-3 flex items-center gap-3 hover:border-brand-300 transition-colors"><span class="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center"><mat-icon>history</mat-icon></span><div class="flex-1"><div class="text-sm font-semibold text-ink-900">Run History</div><div class="text-xs text-ink-400">{{ store.syncRuns().length }} runs · {{ failedRuns() }} failed</div></div><mat-icon class="text-ink-300">chevron_right</mat-icon></a>
      <a routerLink="/contracts-budget/sync-errors" class="surface-card px-4 py-3 flex items-center gap-3 hover:border-brand-300 transition-colors"><span class="w-9 h-9 rounded-lg bg-red-50 text-status-red flex items-center justify-center"><mat-icon>error_outline</mat-icon></span><div class="flex-1"><div class="text-sm font-semibold text-ink-900">Error Log</div><div class="text-xs text-ink-400">{{ openErrors() }} open errors</div></div><mat-icon class="text-ink-300">chevron_right</mat-icon></a>
      <a routerLink="/contracts-budget/sync-config" class="surface-card px-4 py-3 flex items-center gap-3 hover:border-brand-300 transition-colors"><span class="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center"><mat-icon>schedule</mat-icon></span><div class="flex-1"><div class="text-sm font-semibold text-ink-900">Configuration</div><div class="text-xs text-ink-400">{{ ops.syncConfig().enabled ? ops.syncConfig().frequency + ' at ' + ops.syncConfig().time : 'Off' }}</div></div><mat-icon class="text-ink-300">chevron_right</mat-icon></a>
    </div>

    <app-data-table title="Latest runs" [columns]="columns" [rows]="latest()" [pageSize]="5" [exportable]="false"></app-data-table>
    <p class="text-xs text-ink-400 mt-3">The full list is under <a class="text-brand-600 font-medium" routerLink="/contracts-budget/sync-history">Run History</a>. A failed run keeps the last valid data.</p>
  `,
})
export class SyncOverviewComponent {
  store = inject(CrcStore);
  ops = inject(ContractOps);

  healthy = computed(() => this.store.syncRuns().find((r) => r.type === 'Automated')?.status !== 'Failed');
  failedRuns = computed(() => this.store.syncRuns().filter((r) => r.status === 'Failed').length);
  openErrors = computed(() => this.ops.errorLog().filter((e) => e.resolution === 'Open').length);
  lastSync = computed(() => {
    const run = this.store.syncRuns().find((r) => r.type === 'Automated') ?? this.store.syncRuns()[0];
    return run ? new Date(run.finishedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Never';
  });
  nextRun = computed(() => { const d = this.ops.nextRun(); return d ? d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Muscat' }) + ' (Muscat)' : 'Not scheduled'; });
  latest = computed(() => this.store.syncRuns().map((r) => ({ ...r, contract: r.contractReference ?? 'All contracts', errors: r.errors ?? 0 })));

  columns: TableColumn<any>[] = [
    { key: 'type', label: 'Type' },
    { key: 'startedAt', label: 'Start', type: 'date' },
    { key: 'initiatedBy', label: 'Initiated by' },
    { key: 'contract', label: 'Contract' },
    { key: 'processed', label: 'Processed', type: 'number', align: 'right' },
    { key: 'updated', label: 'Updated', type: 'number', align: 'right' },
    { key: 'errors', label: 'Errors', type: 'number', align: 'right' },
    { key: 'status', label: 'Status', type: 'status', statusFn: (r) => ({ label: r.status, level: r.status === 'Failed' ? 'red' : r.status === 'No Changes' ? 'neutral' : 'normal' }) },
  ];
}
