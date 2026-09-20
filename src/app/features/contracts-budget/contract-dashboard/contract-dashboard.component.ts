import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { BaseChartDirective } from 'ng2-charts';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { ChartCardComponent } from '../../../shared/components/chart-card/chart-card.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { VendorDetailDialogComponent } from '../../../shared/components/vendor-detail-dialog/vendor-detail-dialog.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { Contract } from '../../../core/models/domain';
import { DIALOG_SIZE } from '../../../shared/dialog-sizes';
import { daysRemainingToLevel } from '../../../core/models/status';

interface VendorSummary {
  name: string;
  color: string;
  value: number;
  contracts: Contract[];
}

const VENDOR_PALETTE = ['#2d13ea', '#ea6e00', '#0f9c8f', '#0e9f6e', '#e3a008', '#8589a3'];

import { RequiresDirective } from '../../../shared/directives/requires.directive';

@Component({
  selector: 'app-contract-dashboard',
  standalone: true,
  imports: [RequiresDirective, CommonModule, MatDialogModule, MatIconModule, MatButtonModule, BaseChartDirective, PageHeaderComponent, KpiCardComponent, ChartCardComponent, DataTableComponent],
  template: `
    <app-page-header title="Contract Management Dashboard" [subtitle]="'Synced read-only from the ERP · last sync ' + lastSyncLabel()">
      <span class="status-chip" [class.status-chip--normal]="syncHealthy()" [class.status-chip--red]="!syncHealthy()">{{ syncHealthy() ? 'Sync healthy' : 'Last sync failed' }}</span>
      <button mat-stroked-button (click)="runSync()" appRequires="Manual Contract Sync" [disabled]="syncing()">
        <mat-icon class="!text-base !mr-1" [class.animate-spin]="syncing()">sync</mat-icon>{{ syncing() ? 'Syncing…' : 'Run ERP sync' }}
      </button>
    </app-page-header>

    <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
      <app-kpi-card label="Total Contracts" [value]="contracts().length" icon="description"></app-kpi-card>
      <app-kpi-card label="Active" [value]="activeCount()" level="normal" icon="check_circle"></app-kpi-card>
      <app-kpi-card label="Expiring Soon" [value]="expiringCount()" level="amber" icon="schedule"></app-kpi-card>
      <app-kpi-card label="Expired" [value]="expiredCount()" level="red" icon="event_busy"></app-kpi-card>
      <app-kpi-card label="Total Contract Value" [value]="totalValue() | number:'1.0-0'" unit="OMR" icon="payments"></app-kpi-card>
      <app-kpi-card label="Sync Errors (30d)" [value]="syncErrors()" [level]="syncErrors() ? 'red' : 'normal'" icon="error_outline"></app-kpi-card>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6 lg:h-[360px]">
      <app-chart-card class="lg:col-span-2" title="Contracts Expiring by Month" subtitle="Next 6 months, from the synced end dates" type="bar" [data]="expiryChart()"></app-chart-card>

      <div class="surface-card px-4 pt-3.5 pb-4 sm:px-5 flex flex-col gap-2 h-full min-h-0">
        <div>
          <h3 class="text-[13.5px] font-bold text-ink-900">Contract Value by Vendor</h3>
          <p class="text-xs text-ink-400 mt-0.5">Click a vendor for a full breakdown</p>
        </div>
        <div class="h-[92px] shrink-0">
          <canvas baseChart [data]="vendorChart()" type="doughnut" [options]="vendorChartOptions"></canvas>
        </div>
        <div class="flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto">
          @for (v of vendorSummary(); track v.name) {
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

    <app-data-table title="Contracts Expiring Soon" [columns]="columns" [rows]="expiringRows()" (rowClick)="open($event)" emptyTitle="Nothing expiring in the next 30 days" emptyDescription="Contracts due within 30 days will appear here."></app-data-table>
  `,
})
export class ContractDashboardComponent {
  private store = inject(CrcStore);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private ui = inject(UiService);

  contracts = this.store.contracts;
  syncing = signal(false);

  activeCount = computed(() => this.contracts().filter((c) => c.status === 'Active').length);
  expiringCount = computed(() => this.contracts().filter((c) => c.status === 'Expiring Soon').length);
  expiredCount = computed(() => this.contracts().filter((c) => c.status === 'Expired').length);
  totalValue = computed(() => this.contracts().reduce((sum, c) => sum + c.amount, 0));
  expiringRows = computed(() => this.contracts().filter((c) => c.daysRemaining >= 0 && c.daysRemaining <= 30));
  syncErrors = computed(() => this.store.syncRuns().filter((r) => r.status === 'Failed' && Date.now() - new Date(r.startedAt).getTime() < 30 * 86400000).length);
  syncHealthy = computed(() => this.store.syncRuns()[0]?.status !== 'Failed');
  lastSyncLabel = computed(() => {
    const run = this.store.syncRuns()[0];
    if (!run) return 'never';
    const min = Math.max(0, Math.round((Date.now() - new Date(run.finishedAt).getTime()) / 60000));
    return min < 1 ? 'just now' : min < 60 ? `${min} minutes ago` : min < 1440 ? `${Math.round(min / 60)} hours ago` : `${Math.round(min / 1440)} days ago`;
  });

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

  expiryChart = computed(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() + i, 1));
    return {
      labels: months.map((m) => m.toLocaleString('en-GB', { month: 'short' })),
      datasets: [{
        label: 'Contracts Expiring',
        data: months.map((m) => this.contracts().filter((c) => { const e = new Date(c.endDate); return e.getFullYear() === m.getFullYear() && e.getMonth() === m.getMonth(); }).length),
        backgroundColor: '#2d13ea',
      }],
    };
  });

  // Computed from the real synced contracts so the chart, legend and drill-down always agree.
  // Infoline is pinned first; the rest follow by contract value.
  vendorSummary = computed<VendorSummary[]>(() => {
    const all = this.contracts();
    return Array.from(new Set(all.map((c) => c.vendorName)))
      .map((name, i) => {
        const vendorContracts = all.filter((c) => c.vendorName === name);
        return { name, color: VENDOR_PALETTE[i % VENDOR_PALETTE.length], value: vendorContracts.reduce((sum, c) => sum + c.amount, 0), contracts: vendorContracts };
      })
      .sort((a, b) => Number(/infoline/i.test(b.name)) - Number(/infoline/i.test(a.name)) || b.value - a.value);
  });

  vendorChart = computed(() => ({
    labels: this.vendorSummary().map((v) => v.name),
    datasets: [{ data: this.vendorSummary().map((v) => v.value), backgroundColor: this.vendorSummary().map((v) => v.color), borderWidth: 0 }],
  }));

  vendorChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: { legend: { display: false }, tooltip: { enabled: true } },
    onClick: (_evt: any, elements: any[]) => {
      if (elements.length) this.openVendor(this.vendorSummary()[elements[0].index]);
    },
  };

  runSync() {
    if (!this.ui.requires('Manual Contract Sync')) return;
    this.syncing.set(true);
    setTimeout(() => {
      const run = this.store.runFullSync();
      this.syncing.set(false);
      this.ui.toast(run.updated ? `ERP sync complete — ${run.updated} contract${run.updated > 1 ? 's' : ''} updated.` : 'ERP sync complete — no changes found.');
    }, 900);
  }

  open(row: Contract) {
    this.router.navigate(['/contracts-budget/contracts', row.id]);
  }

  openVendor(vendor: VendorSummary) {
    this.dialog.open(VendorDetailDialogComponent, {
      data: { vendorName: vendor.name, contracts: vendor.contracts },
      panelClass: 'app-dialog-panel',
      autoFocus: false,
      ...DIALOG_SIZE.wide,
    });
  }
}
