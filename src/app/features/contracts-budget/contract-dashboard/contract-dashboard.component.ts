import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { ChartCardComponent } from '../../../shared/components/chart-card/chart-card.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { MockDataService } from '../../../core/services/mock-data.service';
import { Contract } from '../../../core/models/domain';
import { daysRemainingToLevel } from '../../../core/models/status';

@Component({
  selector: 'app-contract-dashboard',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, KpiCardComponent, ChartCardComponent, DataTableComponent],
  template: `
    <app-page-header title="Contract Management Dashboard" subtitle="Synced read-only from the ERP · last sync 12 minutes ago">
      <span class="status-chip status-chip--normal">Sync healthy</span>
    </app-page-header>

    <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
      <app-kpi-card label="Total Contracts" [value]="contracts.length" icon="description"></app-kpi-card>
      <app-kpi-card label="Active" [value]="activeCount" level="normal" icon="check_circle"></app-kpi-card>
      <app-kpi-card label="Expiring Soon" [value]="expiringCount" level="amber" icon="schedule"></app-kpi-card>
      <app-kpi-card label="Expired" [value]="expiredCount" level="red" icon="event_busy"></app-kpi-card>
      <app-kpi-card label="Total Contract Value" [value]="totalValue | number:'1.0-0'" unit="OMR" icon="payments"></app-kpi-card>
      <app-kpi-card label="Sync Errors (30d)" [value]="0" level="normal" icon="error_outline"></app-kpi-card>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      <app-chart-card class="lg:col-span-2" title="Contracts Expiring by Month" type="bar" [data]="expiryChart"></app-chart-card>
      <app-chart-card title="Contract Value by Vendor" type="pie" [data]="vendorChart"></app-chart-card>
    </div>

    <h2 class="text-sm font-semibold text-ink-700 mb-3">Contracts Expiring Soon</h2>
    <app-data-table [columns]="columns" [rows]="expiringRows"></app-data-table>
  `,
})
export class ContractDashboardComponent {
  private data = inject(MockDataService);
  contracts: Contract[] = this.data.getContracts();

  get activeCount() { return this.contracts.filter((c) => c.status === 'Active').length; }
  get expiringCount() { return this.contracts.filter((c) => c.status === 'Expiring Soon').length; }
  get expiredCount() { return this.contracts.filter((c) => c.status === 'Expired').length; }
  get totalValue() { return this.contracts.reduce((sum, c) => sum + c.amount, 0); }
  get expiringRows() { return this.contracts.filter((c) => c.daysRemaining >= 0 && c.daysRemaining <= 30); }

  columns: TableColumn<Contract>[] = [
    { key: 'reference', label: 'Reference' },
    { key: 'vendorName', label: 'Vendor' },
    { key: 'contractType', label: 'Type' },
    { key: 'endDate', label: 'End Date', type: 'date' },
    { key: 'daysRemaining', label: 'Days Remaining', type: 'number', align: 'right' },
    { key: 'amount', label: 'Amount', type: 'currency', align: 'right' },
    {
      key: 'status', label: 'Status', type: 'status',
      statusFn: (row) => ({ label: row.status, level: daysRemainingToLevel(row.daysRemaining) }),
    },
  ];

  expiryChart = {
    labels: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
    datasets: [{ label: 'Contracts Expiring', data: [1, 2, 0, 3, 1, 2], backgroundColor: '#2d13ea' }],
  };

  vendorChart = {
    labels: ['Infoline LLC', 'Green Umbrella', 'Al-Waha Facilities', 'Tech Bridge', 'Reliance'],
    datasets: [{ data: [45, 20, 15, 12, 8], backgroundColor: ['#2d13ea', '#ea6e00', '#0f9c8f', '#0e9f6e', '#e3a008'] }],
  };
}
