import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { KanbanBoardComponent, KanbanCard } from '../../../shared/components/kanban-board/kanban-board.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { PaymentRecord } from '../../../core/models/domain';

@Component({
  selector: 'app-tracking',
  standalone: true,
  imports: [CommonModule, RouterModule, PageHeaderComponent, KanbanBoardComponent],
  template: `
    <app-page-header
      title="PO & Payment Tracking"
      subtitle="Purchase order and payment status synced from the ERP &middot; drag a card, or use “Move to”, to advance a payment"
      [breadcrumbs]="[{ label: 'Invoicing & Payments', link: '/invoicing/reconciliation' }, { label: 'PO & Payment Tracking' }]"
    ></app-page-header>
    <app-kanban-board [columns]="columns" [cards]="cards()" (move)="onMove($event)"></app-kanban-board>
    <p class="text-xs text-ink-400 mt-4">New payments appear in <strong>Pending</strong> when an invoice is approved in the <a class="text-brand-600 font-medium" routerLink="/invoicing/reconciliation">Reconciliation Workspace</a>. Completing a payment adds it to actual Outsourcing spend on the budget.</p>
  `,
})
export class TrackingComponent {
  private store = inject(CrcStore);
  private ui = inject(UiService);

  columns = ['Pending', 'Approved', 'Completed'];
  cards = computed<KanbanCard[]>(() =>
    this.store.payments().map((p) => ({
      id: p.id,
      title: p.vendorName,
      subtitle: [p.id, p.invoiceRef, p.period].filter(Boolean).join(' · ') + (p.paymentDate ? ' · Paid ' + p.paymentDate : ''),
      amountLabel: p.invoiceAmount.toLocaleString() + ' OMR',
      column: p.status,
      badge: p.slaAtRisk ? { label: 'SLA at risk', level: 'red' as const } : undefined,
    })),
  );

  async onMove(e: { id: string; column: string }) {
    if (!this.ui.requires('Validate Invoice')) return;
    const p = this.store.payments().find((x) => x.id === e.id);
    if (!p || p.status === e.column) return;
    if (e.column === 'Completed') {
      const ok = await this.ui.confirm({ title: 'Mark payment as completed?', message: `${p.invoiceAmount.toLocaleString()} OMR to ${p.vendorName} will count as actual spend against the Outsourcing budget.`, confirmLabel: 'Mark as paid', icon: 'payments' });
      if (!ok) return;
    }
    this.store.movePayment(e.id, e.column as PaymentRecord['status']);
    this.ui.toast(`${p.vendorName}: ${p.status} → ${e.column}.`);
  }
}
