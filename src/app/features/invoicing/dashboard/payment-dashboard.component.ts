import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { ChartCardComponent } from '../../../shared/components/chart-card/chart-card.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { PaymentRecord } from '../../../core/models/domain';

interface BudgetVsActualRow { category: string; allocated: number; actual: number; variance: number; }

@Component({
  selector: 'app-payment-dashboard',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, KpiCardComponent, ChartCardComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Payment Dashboard"
      subtitle="Vendor payments this cycle and budget vs. actual spend"
      [breadcrumbs]="[{ label: 'Invoicing & Payments' }, { label: 'Payment Dashboard' }]"
    ></app-page-header>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <app-kpi-card label="Total Invoiced" [value]="totalInvoiced() | number:'1.0-0'" unit="OMR" icon="receipt"></app-kpi-card>
      <app-kpi-card label="Pending Payments" [value]="count('Pending')" level="amber" icon="hourglass_top"></app-kpi-card>
      <app-kpi-card label="SLA at Risk" [value]="slaAtRisk()" [level]="slaAtRisk() ? 'red' : 'normal'" icon="warning"></app-kpi-card>
      <app-kpi-card label="Completed this Cycle" [value]="count('Completed')" level="normal" icon="task_alt"></app-kpi-card>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      <app-chart-card class="lg:col-span-2" title="Budget vs. Actual by Category" subtitle="Updates when payments are completed" type="bar" [data]="chart()"></app-chart-card>
      <app-chart-card title="Payments by Status" type="doughnut" [data]="statusChart()"></app-chart-card>
    </div>

    <div class="grid gap-6">
      <app-data-table title="Budget vs. Actual Spend" [columns]="columns" [rows]="budgetVsActual()" [exportable]="true"></app-data-table>
      <app-data-table title="Payments" [columns]="paymentColumns" [rows]="payments()" (rowClick)="goTracking()"></app-data-table>
    </div>
  `,
})
export class PaymentDashboardComponent {
  private store = inject(CrcStore);
  private router = inject(Router);

  payments = this.store.payments;
  totalInvoiced = computed(() => this.payments().reduce((s, p) => s + p.invoiceAmount, 0));
  slaAtRisk = computed(() => this.payments().filter((p) => p.slaAtRisk).length);
  count(status: PaymentRecord['status']) {
    return this.payments().filter((p) => p.status === status).length;
  }

  budgetVsActual = computed<BudgetVsActualRow[]>(() => this.store.budgetByCategory().map((c) => ({ category: c.category, allocated: c.allocated, actual: c.spent, variance: c.allocated - c.spent })));
  chart = computed(() => ({
    labels: this.budgetVsActual().map((r) => r.category),
    datasets: [
      { label: 'Allocated', data: this.budgetVsActual().map((r) => r.allocated), backgroundColor: '#0f9c8f' },
      { label: 'Actual', data: this.budgetVsActual().map((r) => r.actual), backgroundColor: '#2d13ea' },
    ],
  }));
  statusChart = computed(() => ({ labels: ['Pending', 'Approved', 'Completed'], datasets: [{ data: [this.count('Pending'), this.count('Approved'), this.count('Completed')], backgroundColor: ['#e3a008', '#2d13ea', '#0e9f6e'], borderWidth: 0 }] }));

  columns: TableColumn<BudgetVsActualRow>[] = [
    { key: 'category', label: 'Category' },
    { key: 'allocated', label: 'Budget Allocated', type: 'currency', align: 'right' },
    { key: 'actual', label: 'Actual Spend', type: 'currency', align: 'right' },
    { key: 'variance', label: 'Variance', type: 'currency', align: 'right' },
  ];

  paymentColumns: TableColumn<PaymentRecord>[] = [
    { key: 'id', label: 'Payment' },
    { key: 'vendorName', label: 'Vendor' },
    { key: 'invoiceAmount', label: 'Amount', type: 'currency', align: 'right' },
    { key: 'paymentDate', label: 'Paid on' },
    { key: 'status', label: 'Status', type: 'status', statusFn: (p) => ({ label: p.slaAtRisk ? p.status + ' · SLA at risk' : p.status, level: p.slaAtRisk ? 'red' : p.status === 'Completed' ? 'normal' : p.status === 'Approved' ? 'info' : 'amber' }) },
  ];

  goTracking() {
    this.router.navigate(['/invoicing/tracking']);
  }
}
