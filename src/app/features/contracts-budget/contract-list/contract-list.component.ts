import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { MockDataService } from '../../../core/services/mock-data.service';
import { Contract } from '../../../core/models/domain';
import { daysRemainingToLevel } from '../../../core/models/status';

@Component({
  selector: 'app-contract-list',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Contract List"
      subtitle="Read-only view synced from the ERP &middot; click a row to open contract details"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Contract List' }]"
    ></app-page-header>
    <app-data-table [columns]="columns" [rows]="contracts" (rowClick)="open($event)"></app-data-table>
    <p class="text-xs text-ink-400 mt-3">Click any row to view full contract, PO, and sync details. Manual sync is available from the contract details page.</p>
  `,
})
export class ContractListComponent {
  private data = inject(MockDataService);
  contracts: Contract[] = this.data.getContracts();

  columns: TableColumn<Contract>[] = [
    { key: 'reference', label: 'Reference' },
    { key: 'name', label: 'Name' },
    { key: 'vendorName', label: 'Vendor' },
    { key: 'contractType', label: 'Type' },
    { key: 'parentReference', label: 'Parent Contract' },
    { key: 'endDate', label: 'End Date', type: 'date' },
    { key: 'daysRemaining', label: 'Days Remaining', type: 'number', align: 'right' },
    { key: 'amount', label: 'Amount', type: 'currency', align: 'right' },
    {
      key: 'status', label: 'Status', type: 'status',
      statusFn: (row) => ({ label: row.status, level: daysRemainingToLevel(row.daysRemaining) }),
    },
  ];

  constructor(private router: Router) {}

  open(row: Contract) {
    this.router.navigate(['/contracts-budget/contracts', row.id]);
  }
}
