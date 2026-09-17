import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { MockDataService } from '../../../core/services/mock-data.service';
import { percentUsedToLevel } from '../../../core/models/status';

@Component({
  selector: 'app-budget-breakdown',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Budget Breakdown"
      subtitle="Spent amount per item against the approved budget"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Budget Breakdown' }]"
    ></app-page-header>
    <app-data-table [columns]="columns" [rows]="rows"></app-data-table>
  `,
})
export class BudgetBreakdownComponent {
  private data = inject(MockDataService);
  private lines = this.data.getBudgetLines();
  rows = this.lines.map((l) => ({
    ...l,
    remaining: l.allocated - l.spent,
    pctUsed: Math.round((l.spent / l.allocated) * 100),
  }));

  columns: TableColumn<any>[] = [
    { key: 'item', label: 'Item' },
    { key: 'category', label: 'Category' },
    { key: 'allocated', label: 'Allocated', type: 'currency', align: 'right' },
    { key: 'spent', label: 'Spent', type: 'currency', align: 'right' },
    { key: 'remaining', label: 'Remaining', type: 'currency', align: 'right' },
    {
      key: 'pctUsed', label: '% Used', type: 'status', align: 'right',
      statusFn: (r) => ({ label: r.pctUsed + '%', level: percentUsedToLevel(r.pctUsed) }),
    },
  ];
}
