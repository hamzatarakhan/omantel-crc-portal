import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { ContractOps } from '../../../core/services/contract-ops.service';
import { UiService } from '../../../shared/services/ui.service';
import { SyncError } from '../../../core/services/contract-monitoring';

@Component({
  selector: 'app-sync-errors',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Synchronization Error Log"
      subtitle="Failed synchronizations and rejected records, with category and resolution status"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Synchronization' }, { label: 'Error Log' }]"
    ></app-page-header>

    <app-data-table title="Integration error log" [columns]="columns" [rows]="errors()" [exportable]="store.can('Export Contract Data')" (rowAction)="resolve($event.row)" emptyTitle="No errors" emptyDescription="Synchronization failures and rejected records appear here.">
      <div toolbar class="flex items-center gap-1 bg-surface-subtle border border-surface-border rounded-lg p-0.5">
        @for (f of filters; track f) {
          <button (click)="filter.set(f)" class="px-2.5 py-1 text-xs font-semibold rounded-md transition-colors" [class]="filter() === f ? 'bg-white text-brand-700 border border-surface-border' : 'text-ink-500 hover:text-ink-900 border border-transparent'">{{ f }}</button>
        }
      </div>
    </app-data-table>
    <p class="text-xs text-ink-400 mt-3">A contract with a failed manual synchronization can be retried from its details page. Errors are marked resolved automatically when a later synchronization succeeds.</p>
  `,
})
export class SyncErrorsComponent {
  store = inject(CrcStore);
  private ops = inject(ContractOps);
  private ui = inject(UiService);

  filters = ['All', 'Open', 'Resolved'];
  filter = signal('All');
  errors = computed(() => this.ops.errorLog().filter((e) => this.filter() === 'All' || (this.filter() === 'Open' ? e.resolution === 'Open' : e.resolution !== 'Open')));

  columns: TableColumn<any>[] = [
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

  async resolve(e: SyncError) {
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
