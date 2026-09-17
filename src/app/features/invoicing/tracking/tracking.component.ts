import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { KanbanBoardComponent, KanbanCard } from '../../../shared/components/kanban-board/kanban-board.component';
import { MockDataService } from '../../../core/services/mock-data.service';

@Component({
  selector: 'app-tracking',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, KanbanBoardComponent],
  template: `
    <app-page-header
      title="PO & Payment Tracking"
      subtitle="Purchase order and payment status synced from the ERP"
      [breadcrumbs]="[{ label: 'Invoicing & Payments', link: '/invoicing/dashboard' }, { label: 'PO & Payment Tracking' }]"
    ></app-page-header>
    <app-kanban-board [columns]="columns" [cards]="cards"></app-kanban-board>
  `,
})
export class TrackingComponent {
  private data = inject(MockDataService);
  columns = ['Pending', 'Approved', 'Completed'];
  cards: KanbanCard[] = this.data.getPaymentRecords().map((p) => ({
    id: p.id,
    title: p.vendorName,
    subtitle: p.paymentDate ? 'Paid ' + p.paymentDate : 'Awaiting payment',
    amountLabel: p.invoiceAmount.toLocaleString() + ' OMR',
    column: p.status,
    badge: p.slaAtRisk ? { label: 'SLA at risk', level: 'red' as const } : undefined,
  }));
}
