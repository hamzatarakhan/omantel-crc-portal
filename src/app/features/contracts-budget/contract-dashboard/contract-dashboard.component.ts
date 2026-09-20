import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { BaseChartDirective } from 'ng2-charts';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { ChartCardComponent } from '../../../shared/components/chart-card/chart-card.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { VendorDetailDialogComponent } from '../../../shared/components/vendor-detail-dialog/vendor-detail-dialog.component';
import { MockDataService } from '../../../core/services/mock-data.service';
import { Contract } from '../../../core/models/domain';
import { daysRemainingToLevel } from '../../../core/models/status';

interface VendorSummary {
  name: string;
  color: string;
  value: number;
  contracts: Contract[];
}

const VENDOR_PALETTE = ['#2d13ea', '#ea6e00', '#0f9c8f', '#0e9f6e', '#e3a008', '#8589a3'];

@Component({
  selector: 'app-contract-dashboard',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule, BaseChartDirective, PageHeaderComponent, KpiCardComponent, ChartCardComponent, DataTableComponent],
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

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6 lg:h-[360px]">
      <app-chart-card class="lg:col-span-2" title="Contracts Expiring by Month" type="bar" [data]="expiryChart"></app-chart-card>

      <div class="surface-card p-4 sm:p-5 flex flex-col gap-2 h-full min-h-0">
        <div>
          <h3 class="text-[13.5px] font-bold text-ink-900">Contract Value by Vendor</h3>
          <p class="text-xs text-ink-400 mt-0.5">Click a vendor for a full breakdown</p>
        </div>
        <div class="h-[110px] shrink-0">
          <canvas baseChart [data]="vendorChart" type="doughnut" [options]="vendorChartOptions"></canvas>
        </div>
        <div class="flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto">
          @for (v of vendorSummary; track v.name) {
            <button
              (click)="openVendor(v)"
              class="flex items-center gap-2.5 px-2 py-1 rounded-lg hover:bg-surface-subtle transition-colors text-left shrink-0"
            >
              <span class="w-2.5 h-2.5 rounded-full shrink-0" [style.background]="v.color"></span>
              <span class="text-xs text-ink-700 flex-1 truncate">{{ v.name }}</span>
              <span class="text-xs font-semibold text-ink-900">{{ v.value | number:'1.0-0' }}</span>
              <mat-icon class="!text-base !text-ink-400">chevron_right</mat-icon>
            </button>
          }
        </div>
      </div>
    </div>

    <h2 class="text-sm font-semibold text-ink-700 mb-3">Contracts Expiring Soon</h2>
    <app-data-table [columns]="columns" [rows]="expiringRows"></app-data-table>
  `,
})
export class ContractDashboardComponent {
  private data = inject(MockDataService);
  private dialog = inject(MatDialog);
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

  // Computed from the real synced contracts, not hardcoded — so the chart, the legend,
  // and the drill-down modal always agree with each other and with the rest of the page.
  vendorSummary: VendorSummary[] = Array.from(new Set(this.contracts.map((c) => c.vendorName)))
    .map((name, i) => {
      const vendorContracts = this.contracts.filter((c) => c.vendorName === name);
      return {
        name,
        color: VENDOR_PALETTE[i % VENDOR_PALETTE.length],
        value: vendorContracts.reduce((sum, c) => sum + c.amount, 0),
        contracts: vendorContracts,
      };
    })
    .sort((a, b) => Number(/infoline/i.test(b.name)) - Number(/infoline/i.test(a.name)) || b.value - a.value);

  vendorChart = {
    labels: this.vendorSummary.map((v) => v.name),
    datasets: [{ data: this.vendorSummary.map((v) => v.value), backgroundColor: this.vendorSummary.map((v) => v.color), borderWidth: 0 }],
  };

  vendorChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: { legend: { display: false }, tooltip: { enabled: true } },
    onClick: (_evt: any, elements: any[]) => {
      if (elements.length) this.openVendor(this.vendorSummary[elements[0].index]);
    },
  };

  openVendor(vendor: VendorSummary) {
    this.dialog.open(VendorDetailDialogComponent, {
      data: { vendorName: vendor.name, contracts: vendor.contracts },
      panelClass: 'app-dialog-panel',
      autoFocus: false,
    });
  }
}
