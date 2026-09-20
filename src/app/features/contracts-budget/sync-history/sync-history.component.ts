import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { ContractOps } from '../../../core/services/contract-ops.service';
import { UiService } from '../../../shared/services/ui.service';
import { SyncError } from '../../../core/services/contract-monitoring';

const FILTERS = ['All', 'Completed', 'No Changes', 'Failed'] as const;
const TYPES = ['All', 'Automated', 'Manual'] as const;

@Component({
  selector: 'app-sync-history',
  standalone: true,
  imports: [CommonModule, MatTabsModule, PageHeaderComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Synchronization History"
      subtitle="Every automated and manual ERP synchronization, with record counts, failures and the error log"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Sync History' }]"
    ></app-page-header>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Runs recorded</div><div class="text-lg font-extrabold text-ink-900">{{ store.syncRuns().length }}</div></div>
      <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Failed runs</div><div class="text-lg font-extrabold text-status-red">{{ failedRuns() }}</div></div>
      <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Open errors</div><div class="text-lg font-extrabold" [class]="openErrors() ? 'text-status-red' : 'text-status-normal'">{{ openErrors() }}</div></div>
      <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Next scheduled run</div><div class="text-sm font-semibold text-ink-900 mt-1">{{ next() }}</div></div>
    </div>

    <mat-tab-group>
      <mat-tab label="Synchronization runs">
        <div class="pt-4">
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
        </div>
      </mat-tab>

      <mat-tab [label]="'Error log (' + openErrors() + ' open)'">
        <div class="pt-4">
          <app-data-table title="Integration error log" [columns]="errorColumns" [rows]="errors()" [exportable]="store.can('Export Contract Data')" (rowAction)="errorAction($event.row)" emptyTitle="No errors" emptyDescription="Synchronization failures and rejected records appear here.">
            <div toolbar class="flex items-center gap-1 bg-surface-subtle border border-surface-border rounded-lg p-0.5">
              @for (f of resolutions; track f) {
                <button (click)="resolution.set(f)" class="px-2.5 py-1 text-xs font-semibold rounded-md transition-colors" [class]="resolution() === f ? 'bg-white text-brand-700 border border-surface-border' : 'text-ink-500 hover:text-ink-900 border border-transparent'">{{ f }}</button>
              }
            </div>
          </app-data-table>
          <p class="text-xs text-ink-400 mt-3">A contract with a failed manual synchronization can be retried from its details page. Errors are marked resolved automatically when a later synchronization succeeds.</p>
        </div>
      </mat-tab>
    </mat-tab-group>
  `,
})
export class SyncHistoryComponent {
  store = inject(CrcStore);
  private ops = inject(ContractOps);
  private ui = inject(UiService);

  filters = FILTERS;
  types = TYPES;
  resolutions = ['All', 'Open', 'Resolved'];
  filter = signal<(typeof FILTERS)[number]>('All');
  type = signal<(typeof TYPES)[number]>('All');
  resolution = signal('All');

  rows = computed(() => this.store.syncRuns()
    .filter((r) => (this.filter() === 'All' || r.status === this.filter()) && (this.type() === 'All' || r.type === this.type()))
    .map((r) => ({ ...r, contract: r.contractReference ?? 'All contracts', errors: r.errors ?? 0, error: r.errorMessage ?? '' })));
  errors = computed(() => this.ops.errorLog().filter((e) => this.resolution() === 'All' || (this.resolution() === 'Open' ? e.resolution === 'Open' : e.resolution !== 'Open')));
  failedRuns = computed(() => this.store.syncRuns().filter((r) => r.status === 'Failed').length);
  openErrors = computed(() => this.ops.errorLog().filter((e) => e.resolution === 'Open').length);
  next = computed(() => { const d = this.ops.nextRun(); return d ? d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Muscat' }) + ' (Muscat)' : 'Not scheduled'; });

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

  errorColumns: TableColumn<any>[] = [
    { key: 'syncType', label: 'Synchronization type' },
    { key: 'at', label: 'Date & time', type: 'date' },
    { key: 'contractReference', label: 'Contract reference' },
    { key: 'erpReference', label: 'ERP record reference' },
    { key: 'initiatedBy', label: 'Initiated by' },
    { key: 'message', label: 'Error message' },
    { key: 'category', label: 'Error category' },
    { key: 'processing', label: 'Processing status' },
    { key: 'resolution', label: 'Resolution status', type: 'status', statusFn: (r) => ({ label: r.resolution, level: r.resolution === 'Open' ? 'red' : 'normal' }) },
    { key: 'resolutionNote', label: 'Resolution note' },
    { key: 'do', label: 'Manage', actions: [{ id: 'resolve', label: 'Resolve', icon: 'task_alt', hide: (r) => r.resolution !== 'Open' }] },
  ];

  async errorAction(e: SyncError) {
    if (!this.ui.requires('Manual Contract Sync')) return;
    const v = await this.ui.form({
      title: 'Resolve this error', subtitle: `${e.category} · ${e.contractReference}`, icon: 'task_alt', submitLabel: 'Mark resolved',
      fields: [{ key: 'note', label: 'Resolution note', type: 'textarea', required: true, placeholder: 'e.g. The ERP team fixed the dates; corrected on the next synchronization' }],
    });
    if (!v) return;
    this.ops.resolveError(e.id, v['note']);
    this.ui.toast('Error marked as resolved.');
  }
}
