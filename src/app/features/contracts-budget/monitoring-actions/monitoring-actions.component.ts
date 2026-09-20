import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { RequiresDirective } from '../../../shared/directives/requires.directive';
import { CrcStore } from '../../../core/services/crc-store.service';
import { ContractOps } from '../../../core/services/contract-ops.service';
import { UiService } from '../../../shared/services/ui.service';
import { ACTION_STATUSES, ACTION_TYPES, MonitoringAction } from '../../../core/services/contract-monitoring';
import { addDays } from '../../../core/services/contract-data';

const FILTERS = ['All', 'Open', 'In progress', 'Completed', 'Closed'];

@Component({
  selector: 'app-monitoring-actions',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, PageHeaderComponent, DataTableComponent, RequiresDirective],
  template: `
    <app-page-header
      title="Monitoring Actions"
      subtitle="Follow-up actions on contracts — recorded in CRC only; the contract data is never changed"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Monitoring Actions' }]"
    >
      <button mat-flat-button color="primary" (click)="create()" appRequires="Manage Monitoring Actions"><mat-icon class="!text-base !mr-1">add</mat-icon>New action</button>
    </app-page-header>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Open</div><div class="text-lg font-extrabold text-ink-900">{{ count('Open') }}</div></div>
      <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">In progress</div><div class="text-lg font-extrabold text-ink-900">{{ count('In progress') }}</div></div>
      <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Overdue</div><div class="text-lg font-extrabold" [class]="overdue() ? 'text-status-red' : 'text-status-normal'">{{ overdue() }}</div></div>
      <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Completed or closed</div><div class="text-lg font-extrabold text-ink-900">{{ count('Completed') + count('Closed') }}</div></div>
    </div>

    <app-data-table title="All monitoring actions" [columns]="columns" [rows]="rows()" [exportable]="store.can('Export Contract Data')" (rowClick)="open($event)" (rowAction)="act($event)" emptyTitle="No actions" emptyDescription="Record a review, renewal request or follow-up from here or from a contract.">
      <div toolbar class="flex items-center gap-1 bg-surface-subtle border border-surface-border rounded-lg p-0.5">
        @for (f of filters; track f) {
          <button (click)="filter.set(f)" class="px-2.5 py-1 text-xs font-semibold rounded-md transition-colors" [class]="filter() === f ? 'bg-white text-brand-700 border border-surface-border' : 'text-ink-500 hover:text-ink-900 border border-transparent'">{{ f }}</button>
        }
      </div>
    </app-data-table>
  `,
})
export class MonitoringActionsComponent {
  store = inject(CrcStore);
  private ops = inject(ContractOps);
  private ui = inject(UiService);
  private router = inject(Router);

  filters = FILTERS;
  filter = signal('All');
  private today = new Date().toISOString().slice(0, 10);

  private scopedIds = computed(() => new Set(this.ops.scoped().map((c) => c.id)));
  private all = computed(() => this.ops.actions().filter((a) => this.scopedIds().has(a.contractId)));
  rows = computed(() => this.all().filter((a) => this.filter() === 'All' || a.status === this.filter()).map((a) => ({ ...a, overdue: (a.status === 'Open' || a.status === 'In progress') && a.dueDate < this.today })));
  count = (s: string) => this.all().filter((a) => a.status === s).length;
  overdue = computed(() => this.all().filter((a) => (a.status === 'Open' || a.status === 'In progress') && a.dueDate < this.today).length);

  columns: TableColumn<any>[] = [
    { key: 'contractReference', label: 'Contract' },
    { key: 'type', label: 'Action type' },
    { key: 'owner', label: 'Owner' },
    { key: 'dueDate', label: 'Due date', type: 'date' },
    { key: 'status', label: 'Status', type: 'status', statusFn: (r) => ({ label: r.overdue ? r.status + ' · overdue' : r.status, level: r.overdue ? 'red' : r.status === 'Open' ? 'amber' : r.status === 'In progress' ? 'info' : r.status === 'Completed' ? 'normal' : 'neutral' }) },
    { key: 'erpTransactionRef', label: 'ERP transaction' },
    { key: 'comments', label: 'Comments' },
    { key: 'completedDate', label: 'Completion date', type: 'date' },
    { key: 'createdBy', label: 'Created by' },
    { key: 'lastUpdatedBy', label: 'Last updated by' },
    { key: 'updatedAt', label: 'Last updated', type: 'date' },
    { key: 'do', label: 'Manage', actions: [{ id: 'complete', label: 'Complete', icon: 'check_circle', hide: (r) => r.status === 'Completed' || r.status === 'Closed' }, { id: 'close', label: 'Close', icon: 'cancel', hide: (r) => r.status === 'Closed' }] },
  ];

  open(a: MonitoringAction) {
    const c = this.ops.scoped().find((x) => x.id === a.contractId);
    if (c && this.ui.requires('View Contract Details')) this.router.navigate(['/contracts-budget/contracts', c.id], { queryParams: { tab: 'actions' } });
  }

  act(e: { row: any; id: string }) {
    if (!this.ui.requires('Manage Monitoring Actions')) return;
    this.ops.updateAction(e.row.id, { status: e.id === 'complete' ? 'Completed' : 'Closed' });
    this.ui.toast(e.id === 'complete' ? 'Action marked as completed.' : 'Action closed.');
  }

  async create() {
    if (!this.ui.requires('Manage Monitoring Actions')) return;
    const list = this.ops.active();
    const v = await this.ui.form({
      title: 'New monitoring action', subtitle: 'Recorded in CRC only — the contract is not changed', icon: 'assignment_turned_in', submitLabel: 'Create action',
      values: { contract: list[0]?.id, type: ACTION_TYPES[0], status: 'Open', dueDate: addDays(this.today, 7) },
      fields: [
        { key: 'contract', label: 'Contract', type: 'select', options: list.map((c) => ({ value: c.id, label: `${c.reference} — ${c.name}` })), required: true },
        { key: 'type', label: 'Action type', type: 'select', options: [...ACTION_TYPES], required: true },
        { key: 'owner', label: 'Action owner', required: true },
        { key: 'dueDate', label: 'Due date', type: 'date', required: true },
        { key: 'status', label: 'Action status', type: 'select', options: ACTION_STATUSES, required: true },
        { key: 'erpTransactionRef', label: 'Reference to the ERP transaction' },
        { key: 'comments', label: 'Comments', type: 'textarea' },
      ],
    });
    if (!v) return;
    const c = list.find((x) => x.id === v['contract']);
    if (!c) return;
    this.ops.addAction(c, v);
    this.ui.toast('Action created.');
  }
}
