import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { Contract } from '../../../core/models/domain';
import { daysRemainingToLevel } from '../../../core/models/status';

const STATUSES = ['All', 'Active', 'Expiring Soon', 'Expired'] as const;

@Component({
  selector: 'app-contract-list',
  standalone: true,
  imports: [CommonModule, MatIconModule, PageHeaderComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Contract List"
      subtitle="Read-only view synced from the ERP &middot; click a row to open contract details"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Contract List' }]"
    ></app-page-header>

    <app-data-table title="All contracts" [columns]="columns" [rows]="rows()" (rowClick)="open($event)">
      <div toolbar class="flex items-center gap-2 flex-wrap">
        <div class="flex items-center gap-1 bg-surface-subtle border border-surface-border rounded-lg p-0.5">
          @for (s of statuses; track s) {
            <button
              (click)="status.set(s)"
              class="px-2.5 py-1 text-xs font-semibold rounded-md transition-colors"
              [class]="status() === s ? 'bg-white text-brand-700 border border-surface-border' : 'text-ink-500 hover:text-ink-900 border border-transparent'"
            >{{ s }}</button>
          }
        </div>
        <div class="relative">
          <select
            [value]="vendor()"
            (change)="vendor.set($any($event.target).value)"
            class="pl-3 pr-8 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 appearance-none focus:outline-none focus:border-brand-400"
          >
            <option value="All">All vendors</option>
            @for (v of vendors(); track v) { <option [value]="v">{{ v }}</option> }
          </select>
          <mat-icon class="!text-base !text-ink-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">expand_more</mat-icon>
        </div>
      </div>
    </app-data-table>
    <p class="text-xs text-ink-400 mt-3">Click any row to view full contract, PO, and sync details. Manual sync is available from the contract details page.</p>
  `,
})
export class ContractListComponent {
  private store = inject(CrcStore);
  private router = inject(Router);

  statuses = STATUSES;
  status = signal<(typeof STATUSES)[number]>('All');
  vendor = signal('All');
  vendors = computed(() => [...new Set(this.store.contracts().map((c) => c.vendorName))].sort());

  rows = computed(() =>
    this.store.contracts().filter((c) => (this.status() === 'All' || c.status === this.status()) && (this.vendor() === 'All' || c.vendorName === this.vendor())),
  );

  columns: TableColumn<Contract>[] = [
    { key: 'reference', label: 'Reference' },
    { key: 'name', label: 'Name' },
    { key: 'vendorName', label: 'Vendor' },
    { key: 'contractType', label: 'Type' },
    { key: 'erpReference', label: 'ERP reference' },
    { key: 'endDate', label: 'End Date', type: 'date' },
    { key: 'daysRemaining', label: 'Days Remaining', type: 'number', align: 'right' },
    { key: 'amount', label: 'Amount', type: 'currency', align: 'right' },
    {
      key: 'status', label: 'Status', type: 'status',
      statusFn: (row) => ({ label: row.status, level: daysRemainingToLevel(row.daysRemaining) }),
    },
  ];

  open(row: Contract) {
    this.router.navigate(['/contracts-budget/contracts', row.id]);
  }
}
