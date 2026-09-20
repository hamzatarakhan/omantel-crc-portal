import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { MockDataService } from '../../../core/services/mock-data.service';

interface BudgetVsActualRow { category: string; allocated: number; actual: number; variance: number; }

@Component({
  selector: 'app-payment-dashboard',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, KpiCardComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Payment Dashboard"
      subtitle="Vendor payments this cycle and budget vs. actual spend"
      [breadcrumbs]="[{ label: 'Invoicing & Payments' }, { label: 'Payment Dashboard' }]"
    ></app-page-header>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <app-kpi-card label="Total Invoiced" [value]="totalInvoiced | number:'1.0-0'" unit="OMR" icon="receipt"></app-kpi-card>
      <app-kpi-card label="Pending Payments" [value]="pendingCount" level="amber" icon="hourglass_top"></app-kpi-card>
      <app-kpi-card label="SLA at Risk" [value]="slaAtRiskCount" [level]="slaAtRiskCount ? 'red' : 'normal'" icon="warning"></app-kpi-card>
      <app-kpi-card label="Completed this Cycle" [value]="completedCount" level="normal" icon="task_alt"></app-kpi-card>
    </div>

    <app-data-table title="Budget vs. Actual Spend" [columns]="columns" [rows]="budgetVsActual" [exportable]="true"></app-data-table>
  `,
})
export class PaymentDashboardComponent {
  private data = inject(MockDataService);
  payments = this.data.getPaymentRecords();
  get totalInvoiced() { return this.payments.reduce((s, p) => s + p.invoiceAmount, 0); }
  get pendingCount() { return this.payments.filter((p) => p.status === 'Pending').length; }
  get slaAtRiskCount() { return this.payments.filter((p) => p.slaAtRisk).length; }
  get completedCount() { return this.payments.filter((p) => p.status === 'Completed').length; }

  budgetVsActual: BudgetVsActualRow[] = [
    { category: 'Outsourcing', allocated: 108500, actual: 100700, variance: 7800 },
    { category: 'OJT', allocated: 9000, actual: 6200, variance: 2800 },
    { category: 'Petty Cash', allocated: 3000, actual: 2870, variance: 130 },
    { category: 'Projects', allocated: 15000, actual: 4100, variance: 10900 },
  ];

  columns: TableColumn<BudgetVsActualRow>[] = [
    { key: 'category', label: 'Category' },
    { key: 'allocated', label: 'Budget Allocated', type: 'currency', align: 'right' },
    { key: 'actual', label: 'Actual Spend', type: 'currency', align: 'right' },
    { key: 'variance', label: 'Variance', type: 'currency', align: 'right' },
  ];
}
