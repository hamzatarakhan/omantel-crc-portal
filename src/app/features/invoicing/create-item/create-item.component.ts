import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { RequiresDirective } from '../../../shared/directives/requires.directive';
import { CrcStore, WFO_COMPONENTS, WFO_LABEL, WfoComponent } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';

const FIELD = 'w-full px-2.5 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 focus:outline-none focus:border-brand-400';

/** Adds a new invoice item by hand — a payable line that isn't in the ERP's own PO lines for the contract yet. */
@Component({
  selector: 'app-create-invoice-item',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PageHeaderComponent, RequiresDirective],
  template: `
    <app-page-header
      title="Create Invoice Item"
      subtitle="Add a payable line by hand, with its own approved yearly allocation, so it shows up on Reconciliation"
      [breadcrumbs]="[{ label: 'Invoicing & Payments', link: '/invoicing/reconciliation' }, { label: 'Create Invoice Item' }]"
    ></app-page-header>

    <div class="surface-card px-4 py-4 mb-5 max-w-2xl" appRequires="Configure Payable Rules">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <label class="block"><span class="lbl">Vendor</span>
          <select [class]="field + ' mt-1'" [(ngModel)]="vendor" (ngModelChange)="onVendor()">
            @for (v of vendors(); track v) { <option [value]="v">{{ v }}</option> }
          </select></label>
        <label class="block"><span class="lbl">Contract</span>
          <select [class]="field + ' mt-1'" [(ngModel)]="contractRef" [disabled]="!contracts().length">
            @for (c of contracts(); track c.reference) { <option [value]="c.reference">{{ c.reference }} &middot; {{ c.name }}</option> }
            @empty { <option value="">No contract for this vendor</option> }
          </select></label>
        <label class="block sm:col-span-2"><span class="lbl">Item name</span>
          <input [class]="field + ' mt-1'" placeholder="e.g. Retention Bonus" [(ngModel)]="itemLabel" /></label>
        <label class="block sm:col-span-2"><span class="lbl">Scope of work</span>
          <input [class]="field + ' mt-1'" placeholder="A short description of what this item covers" [(ngModel)]="scope" /></label>
        <label class="block"><span class="lbl">Approved allocation (OMR / year)</span>
          <input type="number" min="0" step="0.01" [class]="field + ' mt-1'" [(ngModel)]="allocated" /></label>
        <label class="block"><span class="lbl">Link to a calculated figure</span>
          <select [class]="field + ' mt-1'" [(ngModel)]="component">
            <option [ngValue]="null">Not linked — contract share</option>
            @for (k of components; track k) { <option [ngValue]="k">{{ label[k] }}</option> }
          </select></label>
      </div>
      <p class="text-[11px] text-ink-400 mt-3 leading-relaxed">
        Linking it to Salary, Overtime, Performance, Voice, Chat, Manage Service Incentive or Yearly Performance makes it behave on Reconciliation exactly like that line does elsewhere (its own upload, or manual entry, or mirroring our calculation) — the same as configuring it on <a class="text-brand-600 font-medium" routerLink="/invoicing/line-mapping">Payable Line Mapping</a> afterwards. Leaving it unlinked gives it a plain monthly share of its own allocation, editable on Reconciliation like any other contract-share line.
      </p>
      <div class="flex justify-end mt-4">
        <button type="button" class="inline-flex items-center gap-1.5 h-9 px-4 text-xs font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:pointer-events-none" [disabled]="!canCreate()" (click)="create()">Create invoice item</button>
      </div>
    </div>

    <div class="surface-card overflow-x-auto">
      <table class="crc-table w-full text-sm">
        <thead><tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide">
          <th class="px-3 py-2.5 font-medium">Vendor</th><th class="px-3 py-2.5 font-medium">Contract</th><th class="px-3 py-2.5 font-medium">Item</th><th class="px-3 py-2.5 font-medium text-right">Allocation (OMR/yr)</th><th class="px-3 py-2.5 font-medium">Linked to</th><th class="px-3 py-2.5 font-medium"></th>
        </tr></thead>
        <tbody>
          @for (i of items(); track i.id) {
            <tr class="border-t border-surface-border">
              <td class="px-3 py-2 text-ink-700">{{ i.vendorName }}</td>
              <td class="px-3 py-2 text-ink-700">{{ i.contractRef }}</td>
              <td class="px-3 py-2"><div class="font-semibold text-ink-900">{{ i.label }}</div><div class="text-[11px] text-ink-400">{{ i.scope }}</div></td>
              <td class="px-3 py-2 text-right tabular-nums">{{ i.allocated | number:'1.0-0' }}</td>
              <td class="px-3 py-2">{{ i.component ? label[i.component] : '—' }}</td>
              <td class="px-3 py-2 text-right"><button type="button" class="text-xs font-semibold text-status-red hover:underline" appRequires="Configure Payable Rules" (click)="remove(i.id)">Remove</button></td>
            </tr>
          } @empty { <tr><td colspan="6" class="px-4 py-10 text-center text-sm text-ink-400">No invoice items added by hand yet.</td></tr> }
        </tbody>
      </table>
    </div>
  `,
  styles: [`.lbl { font-size: 10.5px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: .04em; }`],
})
export class CreateInvoiceItemComponent {
  store = inject(CrcStore);
  private ui = inject(UiService);

  field = FIELD;
  components = WFO_COMPONENTS;
  label = WFO_LABEL;

  vendors = computed(() => [...new Set(this.store.contracts().filter((c) => c.status !== 'Cancelled').map((c) => c.vendorName))]);
  vendor = '';
  contracts = computed(() => this.store.contracts().filter((c) => c.status !== 'Cancelled' && c.vendorName === this.vendor));
  contractRef = '';
  itemLabel = '';
  scope = '';
  allocated: number | null = null;
  component: WfoComponent | null = null;

  items = computed(() => this.store.customInvoiceItems());

  constructor() {
    const v = this.vendors()[0];
    if (v) { this.vendor = v; this.onVendor(); }
  }

  onVendor() {
    const list = this.contracts();
    this.contractRef = list[0]?.reference ?? '';
  }

  canCreate() {
    return !!this.vendor && !!this.contractRef && this.itemLabel.trim().length > 0 && (this.allocated ?? 0) >= 0;
  }

  create() {
    if (!this.ui.requires('Configure Payable Rules') || !this.canCreate()) return;
    this.store.addInvoiceItem({
      contractRef: this.contractRef, vendorName: this.vendor, label: this.itemLabel.trim(),
      scope: this.scope.trim() || 'Added by hand — no scope given', allocated: this.allocated ?? 0, component: this.component,
    });
    this.ui.toast(`"${this.itemLabel.trim()}" added${this.component ? ', linked to ' + this.label[this.component] : ''}.`);
    this.itemLabel = ''; this.scope = ''; this.allocated = null; this.component = null;
  }

  remove(id: string) {
    if (!this.ui.requires('Configure Payable Rules')) return;
    this.store.removeInvoiceItem(id);
    this.ui.toast('Invoice item removed.');
  }
}
