import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { BaseChartDirective } from 'ng2-charts';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { ChartCardComponent } from '../../../shared/components/chart-card/chart-card.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { VendorDetailDialogComponent } from '../../../shared/components/vendor-detail-dialog/vendor-detail-dialog.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { ContractOps } from '../../../core/services/contract-ops.service';
import { UiService } from '../../../shared/services/ui.service';
import { Contract } from '../../../core/models/domain';
import { DIALOG_SIZE } from '../../../shared/dialog-sizes';
import { requiredActionFor, statusLevelFor } from '../../../core/services/contract-monitoring';

interface VendorSummary {
  name: string;
  color: string;
  value: number;
  contracts: Contract[];
}

const VENDOR_PALETTE = ['#2d13ea', '#ea6e00', '#0f9c8f', '#0e9f6e', '#e3a008', '#8589a3'];
const FIELD = 'w-full px-2.5 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 focus:outline-none focus:border-brand-400';

@Component({
  selector: 'app-contract-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, MatDialogModule, MatIconModule, BaseChartDirective, PageHeaderComponent, KpiCardComponent, ChartCardComponent, DataTableComponent],
  template: `
    <app-page-header title="Contract Management" [subtitle]="'Synced read-only from the ERP · ' + ops.historical().length + ' cancelled contract' + (ops.historical().length === 1 ? '' : 's') + ' kept for history'">
      <a routerLink="/contracts-budget/sync" class="status-chip" [class.status-chip--normal]="syncHealthy()" [class.status-chip--red]="!syncHealthy()" title="Open the synchronization overview">{{ syncHealthy() ? 'Automated sync healthy' : 'Last automated sync failed' }}</a>
      <button (click)="filtersOpen.set(!filtersOpen())" class="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-700 bg-white border border-surface-border hover:border-brand-300 rounded-lg px-3 py-2 transition-colors">
        <mat-icon class="!text-[17px] !w-[17px] !h-[17px] !leading-[17px]">filter_alt</mat-icon>Filters
        @if (activeFilters()) { <span class="bg-brand-600 text-white rounded-full px-1.5 text-[10px] leading-4">{{ activeFilters() }}</span> }
      </button>
    </app-page-header>

    @if (filtersOpen()) {
      <div class="surface-card px-4 py-3.5 mb-4">
        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
          @for (f of selects(); track f.key) {
            <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">{{ f.label }}</span>
              <select [class]="field + ' mt-1'" [value]="f.value()" (change)="f.set($any($event.target).value)">
                @for (o of f.options; track o) { <option [value]="o" [selected]="o === f.value()">{{ o === 'All' ? f.all : o }}</option> }
              </select>
            </label>
          }
          <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Ends from</span><input type="date" [class]="field + ' mt-1'" [value]="from()" (change)="from.set($any($event.target).value)" /></label>
          <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Ends to</span><input type="date" [class]="field + ' mt-1'" [value]="to()" (change)="to.set($any($event.target).value)" /></label>
        </div>
        <div class="flex justify-end mt-2.5"><button (click)="clear()" class="text-xs font-semibold text-brand-700 hover:underline">Clear filters</button></div>
      </div>
    }

    <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-4">
      <app-kpi-card label="Total Contracts" [value]="rows().length" icon="description"></app-kpi-card>
      <app-kpi-card label="Active" [value]="count('Active')" level="normal" icon="check_circle"></app-kpi-card>
      <app-kpi-card label="Expiring Soon" [value]="count('Expiring Soon')" level="amber" icon="schedule"></app-kpi-card>
      <app-kpi-card label="Expired" [value]="count('Expired')" level="red" icon="event_busy"></app-kpi-card>
      <app-kpi-card label="Total Contract Value" [value]="totalValue() | number:'1.0-0'" unit="OMR" icon="payments"></app-kpi-card>
      <app-kpi-card label="Total PO Value" [value]="poValue() | number:'1.0-0'" unit="OMR" icon="request_quote"></app-kpi-card>
    </div>

    <p class="text-xs text-ink-500 mb-4"><b class="text-ink-900">{{ rows().length }}</b> parent contracts · <b class="text-ink-900">{{ subcontracts() }}</b> subcontracts · <b class="text-ink-900">{{ pos().length }}</b> purchase orders · <a routerLink="/contracts-budget/needs-attention" class="text-brand-600 font-medium">{{ actionCount() }} need attention</a></p>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6 lg:grid-rows-[380px]">
      <app-chart-card title="Contract Expiry Trend" subtitle="Contracts ending in the next 6 months" type="bar" [data]="expiryChart()"></app-chart-card>

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
            <button (click)="openVendor(v)" class="flex items-center gap-2.5 px-2 py-1 rounded-lg hover:bg-surface-subtle transition-colors text-left shrink-0">
              <span class="w-2.5 h-2.5 rounded-full shrink-0" [style.background]="v.color"></span>
              <span class="text-xs text-ink-700 flex-1 truncate">{{ v.name }}</span>
              <span class="text-xs font-semibold text-ink-900">{{ v.value | number:'1.0-0' }}</span>
              <mat-icon class="!text-base !text-ink-400">chevron_right</mat-icon>
            </button>
          }
        </div>
      </div>

      <app-chart-card title="Contract Status Distribution" subtitle="Active, expiring soon and expired" type="doughnut" [data]="statusChart()"></app-chart-card>
    </div>

    <app-data-table title="Contract Expiry Tracker" [columns]="columns" [rows]="trackerRows()" [pageSize]="8" [exportable]="store.can('Export Contract Data')" (rowClick)="open($event)" emptyTitle="Nothing expiring in the next 30 days" emptyDescription="Contracts due within 30 days, or expired without a renewal, appear here."></app-data-table>
    <p class="text-xs text-ink-400 mt-3">Colours: more than 30 days normal, 30 amber, 15 orange, 5 or expired red, renewed or extended informational.</p>

  `,
})
export class ContractDashboardComponent {
  store = inject(CrcStore);
  ops = inject(ContractOps);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private ui = inject(UiService);

  field = FIELD;
  filtersOpen = signal(false);
  vendor = signal('All');
  type = signal('All');
  status = signal('All');
  parent = signal('All');
  from = signal('');
  to = signal('');

  private vendors = computed(() => [...new Set(this.ops.active().map((c) => c.vendorName))].sort());
  private types = computed(() => [...new Set(this.ops.active().map((c) => c.contractType))].sort());
  selects = computed(() => [
    { key: 'vendor', label: 'Vendor', all: 'All vendors', value: this.vendor, set: (v: string) => this.vendor.set(v), options: ['All', ...this.vendors()] },
    { key: 'type', label: 'Contract type', all: 'All types', value: this.type, set: (v: string) => this.type.set(v), options: ['All', ...this.types()] },
    { key: 'status', label: 'Contract status', all: 'All statuses', value: this.status, set: (v: string) => this.status.set(v), options: ['All', 'Active', 'Expiring Soon', 'Expired'] },
    { key: 'parent', label: 'Parent contract', all: 'All contracts', value: this.parent, set: (v: string) => this.parent.set(v), options: ['All', ...this.ops.active().map((c) => c.reference)] },
  ]);

  /** Contracts after the dashboard filters (cancelled contracts are historical and never counted here). */
  rows = computed(() => this.ops.active().filter((c) =>
    (this.vendor() === 'All' || c.vendorName === this.vendor()) && (this.type() === 'All' || c.contractType === this.type()) &&
    (this.status() === 'All' || c.status === this.status()) && (this.parent() === 'All' || c.reference === this.parent()) &&
    (!this.from() || c.endDate >= this.from()) && (!this.to() || c.endDate <= this.to())));

  private children = computed(() => this.rows().flatMap((c) => this.ops.childrenOf(c)));
  pos = computed(() => this.children().filter((k) => k.recordType === 'Purchase Order'));
  subcontracts = computed(() => this.children().filter((k) => k.recordType === 'Subcontract').length);
  totalValue = computed(() => this.rows().reduce((s, c) => s + c.amount, 0));
  poValue = computed(() => this.pos().reduce((s, k) => s + k.amount, 0));
  actionCount = computed(() => this.rows().filter((c) => this.ops.needsAction(c)).length);
  count = (s: string) => this.rows().filter((c) => c.status === s).length;

  syncHealthy = computed(() => this.store.syncRuns().find((r) => r.type === 'Automated')?.status !== 'Failed');

  trackerRows = computed(() => this.rows().filter((c) => c.daysRemaining <= 30 && c.renewalStatus !== 'Renewed').map((c) => ({ ...c, parentReference: '—', requiredAction: requiredActionFor(c), level: statusLevelFor(c) })));

  activeFilters = computed(() => [this.vendor(), this.type(), this.status(), this.parent()].filter((v) => v !== 'All').length + (this.from() ? 1 : 0) + (this.to() ? 1 : 0));

  columns: TableColumn<any>[] = [
    { key: 'reference', label: 'Contract Reference' },
    { key: 'name', label: 'Contract Name' },
    { key: 'vendorName', label: 'Vendor Name' },
    { key: 'contractType', label: 'Contract Type' },
    { key: 'parentReference', label: 'Parent Contract' },
    { key: 'startDate', label: 'Start Date', type: 'date' },
    { key: 'endDate', label: 'End Date', type: 'date' },
    { key: 'daysRemaining', label: 'Days Remaining', type: 'number', align: 'right' },
    { key: 'amount', label: 'Contract Amount', type: 'currency', align: 'right' },
    { key: 'status', label: 'Status', type: 'status', statusFn: (row) => ({ label: row.status, level: row.level }) },
    { key: 'renewalStatus', label: 'Renewal Status' },
    { key: 'requiredAction', label: 'Required Action' },
    { key: 'lastSyncedAt', label: 'Last Synchronization', type: 'date' },
  ];

  expiryChart = computed(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() + i, 1));
    return {
      labels: months.map((m) => m.toLocaleString('en-GB', { month: 'short', year: '2-digit' })),
      datasets: [{
        label: 'Contracts Expiring',
        data: months.map((m) => this.rows().filter((c) => { const e = new Date(c.endDate); return e.getFullYear() === m.getFullYear() && e.getMonth() === m.getMonth(); }).length),
        backgroundColor: '#2d13ea',
      }],
    };
  });

  statusChart = computed(() => ({
    labels: ['Active', 'Expiring Soon', 'Expired'],
    datasets: [{ data: [this.count('Active'), this.count('Expiring Soon'), this.count('Expired')], backgroundColor: ['#0e9f6e', '#e3a008', '#e02424'], borderWidth: 0 }],
  }));

  // Infoline is pinned first; the rest follow by contract value.
  vendorSummary = computed<VendorSummary[]>(() => {
    const all = this.rows();
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

  clear() {
    for (const s of [this.vendor, this.type, this.status, this.parent]) s.set('All');
    this.from.set('');
    this.to.set('');
  }

  open(row: Contract) {
    if (!this.ui.requires('View Contract Details')) return;
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
