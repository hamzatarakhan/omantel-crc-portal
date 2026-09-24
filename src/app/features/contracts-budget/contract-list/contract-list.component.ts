import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { ContractOps } from '../../../core/services/contract-ops.service';
import { UiService } from '../../../shared/services/ui.service';
import { ListRow } from '../../../core/services/contract-monitoring';
import { infolineFirst } from '../../../core/services/contract-data';

const STATUSES = ['All', 'Active', 'Expiring Soon', 'Expired', 'Historical'] as const;
const RECORD_TYPES: Array<[string, string]> = [['All', 'All records'], ['Contract', 'Contracts'], ['Purchase Order', 'Purchase orders'], ['Variation Order', 'Variation Orders'], ['Amendment', 'Amendments'], ['Time Extension', 'Time extensions']];
const FIELD = 'w-full px-2.5 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 focus:outline-none focus:border-brand-400';

@Component({
  selector: 'app-contract-list',
  standalone: true,
  imports: [CommonModule, MatIconModule, PageHeaderComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Contract List"
      subtitle="Read-only view synced from the ERP &middot; contracts, their variation orders, amendments and extensions &middot; click a row to open the contract"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Contract List' }]"
    ></app-page-header>

    <div class="surface-card px-4 py-3.5 mb-4">
      <div class="flex items-center gap-2 flex-wrap">
        <div class="flex items-center gap-1 bg-surface-subtle border border-surface-border rounded-lg p-0.5">
          @for (s of statuses; track s) {
            <button (click)="status.set(s)" class="px-2.5 py-1 text-xs font-semibold rounded-md transition-colors" [class]="status() === s ? 'bg-white text-brand-700 border border-surface-border' : 'text-ink-500 hover:text-ink-900 border border-transparent'">{{ s }}</button>
          }
        </div>
        <span class="text-[11px] text-ink-400">Cancelled contracts are kept under <b>Historical</b> and hidden from the other views.</span>
        <button (click)="clear()" class="ml-auto text-xs font-semibold text-brand-700 hover:underline">Clear filters</button>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-9 gap-2.5 mt-3">
        @for (f of selects(); track f.key) {
          <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">{{ f.label }}</span>
            <select [class]="field + ' mt-1'" [value]="f.value()" (change)="f.set($any($event.target).value)">
              @for (o of f.options; track o[0]) { <option [value]="o[0]" [selected]="o[0] === f.value()">{{ o[1] }}</option> }
            </select>
          </label>
        }
        <div class="col-span-2 grid grid-cols-2 gap-2.5 md:contents">
        <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Ends from</span><input type="date" [class]="field + ' mt-1'" [value]="from()" (change)="from.set($any($event.target).value)" /></label>
        <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Ends to</span><input type="date" [class]="field + ' mt-1'" [value]="to()" (change)="to.set($any($event.target).value)" /></label>
        </div>
        <div class="col-span-2 grid grid-cols-2 gap-2.5 md:contents">
        <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Amount min (OMR)</span><input type="number" min="0" [class]="field + ' mt-1'" [value]="min()" (input)="min.set($any($event.target).value)" placeholder="0" /></label>
        <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Amount max (OMR)</span><input type="number" min="0" [class]="field + ' mt-1'" [value]="max()" (input)="max.set($any($event.target).value)" placeholder="Any" /></label>
        </div>
      </div>
    </div>

    <app-data-table title="Records" [columns]="columns" [rows]="rows()" [searchKeys]="searchKeys" [exportable]="store.can('Export Contract Data')" (rowClick)="open($event)" (rowAction)="open($event.row)" emptyTitle="No records match" emptyDescription="Clear a filter or search for a contract reference, vendor, scope of work, PO number or ERP reference."></app-data-table>
    <p class="text-xs text-ink-400 mt-3">Search matches contract reference, name, vendor, vendor reference, contract type, status, PO number and ERP reference. Manual synchronization is on the contract details page.</p>
  `,
})
export class ContractListComponent {
  store = inject(CrcStore);
  private ops = inject(ContractOps);
  private router = inject(Router);
  private ui = inject(UiService);

  field = FIELD;
  statuses = STATUSES;
  status = signal<(typeof STATUSES)[number]>('All');
  record = signal('All');
  vendor = signal('All');
  type = signal('All');
  renewal = signal('All');
  sync = signal('All');
  from = signal('');
  to = signal('');
  min = signal('');
  max = signal('');

  searchKeys = ['poNumber', 'vendorRef', 'erpReference', 'parentReference', 'contractType', 'status'];

  private vendors = computed(() => [...new Set(this.ops.scoped().map((c) => c.vendorName))].sort(infolineFirst));
  private types = computed(() => [...new Set(this.ops.scoped().map((c) => c.contractType))].sort());
  private opts = (list: string[], all: string): Array<[string, string]> => [['All', all], ...list.map((x): [string, string] => [x, x])];

  selects = computed(() => [
    { key: 'record', label: 'Record type', value: this.record, set: (v: string) => this.record.set(v), options: RECORD_TYPES },
    { key: 'vendor', label: 'Vendor', value: this.vendor, set: (v: string) => this.vendor.set(v), options: this.opts(this.vendors(), 'All vendors') },
    { key: 'type', label: 'Contract type', value: this.type, set: (v: string) => this.type.set(v), options: this.opts(this.types(), 'All types') },
    { key: 'renewal', label: 'Renewal status', value: this.renewal, set: (v: string) => this.renewal.set(v), options: [['All', 'Any'], ['Renewed', 'Renewed'], ['Renewal in progress', 'Renewal in progress'], ['None', 'No renewal']] as Array<[string, string]> },
    { key: 'sync', label: 'Sync status', value: this.sync, set: (v: string) => this.sync.set(v), options: [['All', 'Any'], ['Synced', 'Synced'], ['Failed', 'Last sync failed']] as Array<[string, string]> },
  ]);

  private cancelledIds = computed(() => new Set(this.ops.scoped().filter((c) => c.status === 'Cancelled').map((c) => c.id)));

  rows = computed(() => {
    const st = this.status();
    const cancelled = this.cancelledIds();
    const min = this.min() === '' ? null : Number(this.min());
    const max = this.max() === '' ? null : Number(this.max());
    return this.ops.records().filter((r) => {
      const historical = cancelled.has(r.parentId);
      if (st === 'Historical' ? !historical : historical) return false;
      if (st !== 'All' && st !== 'Historical' && r.status !== st) return false;
      if (this.record() !== 'All' && r.recordType !== this.record()) return false;
      if (this.vendor() !== 'All' && r.vendorName !== this.vendor()) return false;
      if (this.type() !== 'All' && r.contractType !== this.type()) return false;
      if (this.renewal() === 'None' ? !!r.renewalStatus : this.renewal() !== 'All' && r.renewalStatus !== this.renewal()) return false;
      if (this.sync() !== 'All' && r.syncStatus !== this.sync()) return false;
      if (this.from() && r.endDate < this.from()) return false;
      if (this.to() && r.endDate > this.to()) return false;
      if (min !== null && (r.amount === null || r.amount < min)) return false;
      if (max !== null && (r.amount === null || r.amount > max)) return false;
      return true;
    });
  });

  columns: TableColumn<ListRow>[] = [
    { key: 'reference', label: 'Reference' },
    { key: 'name', label: 'Name' },
    { key: 'vendorName', label: 'Vendor' },
    { key: 'contractType', label: 'Contract type' },
    { key: 'recordType', label: 'Record type' },
    { key: 'erpReference', label: 'ERP reference' },
    { key: 'startDate', label: 'Start date', type: 'date' },
    { key: 'endDate', label: 'End date', type: 'date' },
    { key: 'daysRemaining', label: 'Days remaining', display: (r) => r.remaining },
    { key: 'amount', label: 'Amount', type: 'currency', align: 'right' },
    { key: 'status', label: 'Status', type: 'status', statusFn: (r) => ({ label: r.status, level: r.level }) },
    { key: 'renewalStatus', label: 'Renewal status' },
    { key: 'syncStatus', label: 'Sync', type: 'status', statusFn: (r) => ({ label: r.syncStatus, level: r.syncStatus === 'Failed' ? 'red' : 'normal' }) },
    { key: 'lastSyncedAt', label: 'Last sync date', type: 'date' },
    { key: 'actions', label: 'Actions', actions: [{ id: 'view', label: 'View', icon: 'visibility' }] },
  ];

  clear() {
    this.status.set('All');
    for (const s of [this.record, this.vendor, this.type, this.renewal, this.sync]) s.set('All');
    for (const s of [this.from, this.to, this.min, this.max]) s.set('');
  }

  open(row: ListRow) {
    if (!this.ui.requires('View Contract Details')) return;
    this.router.navigate(['/contracts-budget/contracts', row.parentId], row.recordType === 'Contract' || row.recordType === 'Purchase Order' ? {} : { queryParams: { tab: 'records' } });
  }
}
