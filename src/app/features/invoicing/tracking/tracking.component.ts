import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { KanbanBoardComponent, KanbanCard } from '../../../shared/components/kanban-board/kanban-board.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { PaymentRecord } from '../../../core/models/domain';
import { StatusLevel } from '../../../core/models/status';

const FIELD = 'w-full px-2.5 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 focus:outline-none focus:border-brand-400';
const STATUSES: PaymentRecord['status'][] = ['Pending', 'Approved', 'Completed'];
const LEVEL: Record<PaymentRecord['status'], StatusLevel> = { Pending: 'info', Approved: 'amber', Completed: 'normal' };
const PAGE = 10;

/** Every invoice sent for payment. Their status comes from the ERP, so the screen only reads it: filter, look, never move. */
@Component({
  selector: 'app-tracking',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, PageHeaderComponent, KanbanBoardComponent, StatusChipComponent],
  template: `
    <app-page-header
      title="Payment Tracking"
      subtitle="Purchase order and payment status, updated from the ERP"
      [breadcrumbs]="[{ label: 'Invoicing & Payments', link: '/invoicing/reconciliation' }, { label: 'Payment Tracking' }]"
    >
      <div class="inline-flex rounded-lg border border-surface-border bg-white p-0.5">
        <button type="button" class="vbtn" [class.on]="view() === 'table'" (click)="view.set('table')"><mat-icon class="!text-base">table_rows</mat-icon>Table</button>
        <button type="button" class="vbtn" [class.on]="view() === 'board'" (click)="view.set('board')"><mat-icon class="!text-base">view_kanban</mat-icon>Board</button>
      </div>
    </app-page-header>

    <div class="surface-card px-4 py-3.5 mb-4">
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
        <label class="block"><span class="lbl">Search</span>
          <input [class]="field + ' mt-1'" placeholder="Payment, invoice or amount" [value]="q()" (input)="q.set($any($event.target).value); page.set(0)" /></label>
        <label class="block"><span class="lbl">Invoice item</span>
          <select [class]="field + ' mt-1'" (change)="item.set($any($event.target).value); page.set(0)">
            <option value="All" [selected]="item() === 'All'">All items</option>
            @for (i of itemOptions(); track i) { <option [value]="i" [selected]="i === item()">{{ i }}</option> }
          </select></label>
        <label class="block"><span class="lbl">Vendor</span>
          <select [class]="field + ' mt-1'" (change)="setVendor($any($event.target).value)">
            <option value="All" [selected]="vendor() === 'All'">All vendors</option>
            @for (v of vendorOptions(); track v) { <option [value]="v" [selected]="v === vendor()">{{ v }}</option> }
          </select></label>
        <label class="block"><span class="lbl">Contract</span>
          <select [class]="field + ' mt-1'" (change)="contract.set($any($event.target).value); page.set(0)">
            <option value="All" [selected]="contract() === 'All'">All contracts</option>
            @for (c of contractOptions(); track c) { <option [value]="c" [selected]="c === contract()">{{ c }}</option> }
          </select></label>
        <label class="block"><span class="lbl">Status</span>
          <select [class]="field + ' mt-1'" (change)="status.set($any($event.target).value); page.set(0)">
            <option value="All" [selected]="status() === 'All'">All statuses ({{ count('All') }})</option>
            @for (s of statuses; track s) { <option [value]="s" [selected]="s === status()">{{ s }} ({{ count(s) }})</option> }
          </select></label>
      </div>
      <div class="flex items-center justify-between mt-2.5 text-xs text-ink-500">
        <span><b class="text-ink-700">{{ rows().length }}</b> of {{ store.payments().length }} invoice{{ store.payments().length === 1 ? '' : 's' }}</span>
        <button type="button" (click)="reset()" class="font-semibold text-brand-700 hover:underline">Reset filters</button>
      </div>
    </div>

    @if (view() === 'table') {
      <div class="surface-card overflow-x-auto">
        <table class="crc-table w-full text-sm">
          <thead><tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide">
            <th class="px-3 py-2.5 font-medium">Payment</th><th class="px-3 py-2.5 font-medium">Vendor</th><th class="px-3 py-2.5 font-medium">Contract</th>
            <th class="px-3 py-2.5 font-medium min-w-[260px]">Invoice items</th><th class="px-3 py-2.5 font-medium">Period</th><th class="px-3 py-2.5 font-medium text-right">Amount</th>
            <th class="px-3 py-2.5 font-medium">Status</th><th class="px-3 py-2.5 font-medium min-w-[150px]">Where it is</th><th class="px-3 py-2.5 font-medium min-w-[190px]">Documents</th>
          </tr></thead>
          <tbody>
            @for (p of pageRows(); track p.id) {
              <tr class="border-t border-surface-border align-top">
                <td class="px-3 py-2.5 whitespace-nowrap"><div class="font-semibold text-ink-900">{{ p.id }}</div><div class="text-[11px] text-ink-400">{{ p.invoiceRef || '—' }}</div></td>
                <td class="px-3 py-2.5 text-ink-800">{{ p.vendorName }}</td>
                <td class="px-3 py-2.5 text-ink-700 whitespace-nowrap">{{ p.contract || '—' }}</td>
                <td class="px-3 py-2.5">
                  <div class="flex flex-wrap gap-1.5">
                    @for (i of p.items ?? []; track i.label) {
                      <span class="inline-flex items-center gap-1 text-[11.5px] font-semibold px-2 py-0.5 rounded-md bg-brand-50 text-brand-700">{{ i.label }}<span class="font-normal" [class.opacity-70]="i.linkedTo" [class.text-ink-400]="!i.linkedTo">&rarr; {{ i.linkedTo || 'contract share' }}</span></span>
                    } @empty { <span class="text-xs text-ink-400">—</span> }
                  </div>
                </td>
                <td class="px-3 py-2.5 text-ink-700 whitespace-nowrap">{{ p.period || '—' }}</td>
                <td class="px-3 py-2.5 text-right whitespace-nowrap font-semibold text-ink-900">{{ p.invoiceAmount | number:'1.0-0' }} <span class="text-xs font-normal text-ink-400">OMR</span></td>
                <td class="px-3 py-2.5"><app-status-chip [label]="p.status" [level]="level[p.status]"></app-status-chip>@if (p.slaAtRisk) { <div class="mt-1"><app-status-chip label="SLA at risk" level="red"></app-status-chip></div> }</td>
                <td class="px-3 py-2.5 text-xs">
                  @if (p.status === 'Pending') { <span class="text-status-amber font-semibold">Pending at {{ p.pendingAt || 'the ERP' }}</span> }
                  @else if (p.status === 'Completed') { <span class="text-ink-600">Paid {{ p.paymentDate || '' }}</span> }
                  @else { <span class="text-ink-400">Awaiting payment</span> }
                </td>
                <td class="px-3 py-2.5 text-xs">
                  @for (d of p.documents ?? []; track $index) {
                    <button type="button" class="flex items-center gap-1 py-0.5 text-left text-ink-700 hover:text-brand-700 hover:underline" (click)="openDoc(d)" [title]="'Open ' + d.name"><mat-icon class="!text-sm !w-4 !h-4 text-brand-600 shrink-0">description</mat-icon><span><b class="font-semibold">{{ d.kind }}</b> <span class="text-ink-400">&middot; {{ d.name }}</span></span></button>
                  } @empty { <span class="text-ink-400">—</span> }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="9" class="px-4 py-12 text-center text-sm text-ink-400">No invoices match these filters. <button type="button" class="text-brand-600 font-semibold hover:underline" (click)="reset()">Reset filters</button></td></tr>
            }
          </tbody>
        </table>
      </div>
      @if (pages() > 1) {
        <div class="flex items-center justify-between mt-3 text-xs text-ink-500">
          <span>Showing {{ page() * pageSize + 1 }}–{{ Math.min(rows().length, (page() + 1) * pageSize) }} of {{ rows().length }}</span>
          <div class="flex items-center gap-1.5">
            <button type="button" class="pbtn" [disabled]="page() === 0" (click)="page.set(page() - 1)"><mat-icon class="!text-lg">chevron_left</mat-icon></button>
            <span>Page {{ page() + 1 }} of {{ pages() }}</span>
            <button type="button" class="pbtn" [disabled]="page() >= pages() - 1" (click)="page.set(page() + 1)"><mat-icon class="!text-lg">chevron_right</mat-icon></button>
          </div>
        </div>
      }
    } @else {
      <app-kanban-board [columns]="boardColumns()" [cards]="cards()" [readOnly]="true"></app-kanban-board>
    }
    <p class="text-xs text-ink-400 mt-4">New payments appear here as <strong>Pending</strong> when an invoice is approved in the <a class="text-brand-600 font-medium" routerLink="/invoicing/reconciliation">Reconciliation Workspace</a>. From then on the ERP moves them through Approved and Completed, and this screen follows. Each invoice item shows what it is linked to on <a class="text-brand-600 font-medium" routerLink="/invoicing/line-mapping">Payable Line Mapping</a>.</p>
  `,
  styles: [`
    .lbl { font-size: 10.5px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: .04em; }
    .vbtn { display: inline-flex; align-items: center; gap: 4px; padding: 5px 12px; font-size: 12px; font-weight: 600; border-radius: 6px; color: #6b7280; }
    .vbtn.on { background: #fff4e9; color: #c2410c; }
    .pbtn { width: 28px; height: 28px; border-radius: 8px; border: 1px solid #e3e2ec; background: #fff; display: inline-flex; align-items: center; justify-content: center; color: #413e5c; }
    .pbtn:disabled { opacity: .4; cursor: default; }
  `],
})
export class TrackingComponent {
  store = inject(CrcStore);

  Math = Math;
  field = FIELD;
  statuses = STATUSES;
  level = LEVEL;
  pageSize = PAGE;

  view = signal<'table' | 'board'>('table');
  q = signal('');
  item = signal('All');
  vendor = signal('All');
  contract = signal('All');
  status = signal<'All' | PaymentRecord['status']>('Pending');
  page = signal(0);

  private all = () => this.store.payments();
  itemOptions = computed(() => [...new Set(this.all().flatMap((p) => (p.items ?? []).map((i) => i.label)))].sort((a, b) => a.localeCompare(b)));
  vendorOptions = computed(() => [...new Set(this.all().map((p) => p.vendorName))]);
  contractOptions = computed(() => [...new Set(this.all().filter((p) => this.vendor() === 'All' || p.vendorName === this.vendor()).map((p) => p.contract).filter((c): c is string => !!c))]);

  count = (s: 'All' | PaymentRecord['status']) => this.all().filter((p) => s === 'All' || p.status === s).length;

  rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.all().filter((p) =>
      (this.status() === 'All' || p.status === this.status()) &&
      (this.vendor() === 'All' || p.vendorName === this.vendor()) &&
      (this.contract() === 'All' || p.contract === this.contract()) &&
      (this.item() === 'All' || (p.items ?? []).some((i) => i.label === this.item())) &&
      (!q || [p.id, p.invoiceRef, p.vendorName, p.contract, String(p.invoiceAmount)].some((x) => (x ?? '').toLowerCase().includes(q))));
  });
  pages = computed(() => Math.max(1, Math.ceil(this.rows().length / PAGE)));
  pageRows = computed(() => this.rows().slice(Math.min(this.page(), this.pages() - 1) * PAGE, (Math.min(this.page(), this.pages() - 1) + 1) * PAGE));

  boardColumns = computed(() => (this.status() === 'All' ? STATUSES : [this.status() as string]));
  cards = computed<KanbanCard[]>(() =>
    this.rows().map((p) => ({
      id: p.id,
      title: p.vendorName,
      subtitle: [p.id, p.contract, p.invoiceRef, p.period].filter(Boolean).join(' · ') + (p.paymentDate ? ' · Paid ' + p.paymentDate : ''),
      amountLabel: p.invoiceAmount.toLocaleString() + ' OMR',
      column: p.status,
      chips: (p.items ?? []).map((i) => ({ label: i.label, tag: i.linkedTo ?? 'contract share' })),
      note: p.status === 'Pending' ? `Pending at ${p.pendingAt || 'the ERP'}` : undefined,
      badge: p.slaAtRisk ? { label: 'SLA at risk', level: 'red' as const } : undefined,
    })),
  );

  setVendor(v: string) {
    this.vendor.set(v);
    if (this.contract() !== 'All' && !this.contractOptions().includes(this.contract())) this.contract.set('All');
    this.page.set(0);
  }

  /** Uploaded files open from the browser; the demo's sample documents open as a small placeholder. */
  openDoc(d: { name: string; url?: string }) {
    const url = d.url ?? URL.createObjectURL(new Blob([`Sample document: ${d.name}

This prototype has no file storage; documents attached during the demo open from memory.`], { type: 'text/plain' }));
    window.open(url, '_blank');
  }

  reset() {
    this.q.set(''); this.item.set('All'); this.vendor.set('All'); this.contract.set('All'); this.status.set('Pending'); this.page.set(0);
  }
}
