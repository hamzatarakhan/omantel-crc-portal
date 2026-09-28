import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { RequiresDirective } from '../../../shared/directives/requires.directive';
import { CrcStore, WFO_COMPONENTS, WFO_LABEL, WfoComponent } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';

const FIELD = 'w-full px-2.5 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 focus:outline-none focus:border-brand-400';

/**
 * Every PO line, and which calculated component (Salary, Overtime, Performance, Incentive, Management fee) it is billed
 * from on Reconciliation. A line with no link keeps taking the contract's monthly yearly-budget share, as before.
 */
@Component({
  selector: 'app-line-mapping',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, PageHeaderComponent, RequiresDirective],
  template: `
    <app-page-header
      title="Payable Line Mapping"
      subtitle="Link each PO line to the calculated figure it should be billed from, so Reconciliation knows what to charge for it"
      [breadcrumbs]="[{ label: 'Invoicing & Payments', link: '/invoicing/reconciliation' }, { label: 'Payable Line Mapping' }]"
    ></app-page-header>

    <div class="surface-card px-4 py-3.5 mb-4">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <label class="block"><span class="lbl">Vendor</span>
          <select [class]="field + ' mt-1'" (change)="vendor.set($any($event.target).value)">
            <option value="All" [selected]="vendor() === 'All'">All vendors</option>
            @for (v of vendors(); track v) { <option [value]="v" [selected]="v === vendor()">{{ v }}</option> }
          </select></label>
        <label class="block"><span class="lbl">Contract</span>
          <select [class]="field + ' mt-1'" (change)="contract.set($any($event.target).value)">
            <option value="All">All contracts</option>
            @for (c of contracts(); track c) { <option [value]="c" [selected]="c === contract()">{{ c }}</option> }
          </select></label>
        <label class="block"><span class="lbl">Linked</span>
          <select [class]="field + ' mt-1'" (change)="linked.set($any($event.target).value)">
            <option value="All" [selected]="linked() === 'All'">All lines</option>
            <option value="Linked" [selected]="linked() === 'Linked'">Linked</option>
            <option value="Unlinked" [selected]="linked() === 'Unlinked'">Not linked</option>
          </select></label>
        <label class="block"><span class="lbl">Scope of work</span>
          <input [class]="field + ' mt-1'" placeholder="Search a line" [value]="q()" (input)="q.set($any($event.target).value)" /></label>
      </div>
      <div class="flex items-center justify-between mt-2.5 text-xs">
        <span class="text-ink-500"><b class="text-ink-700">{{ linkedCount() }}</b> of <b class="text-ink-700">{{ rows().length }}</b> lines linked to a calculated figure.</span>
        <button (click)="clear()" class="font-semibold text-brand-700 hover:underline">Clear filters</button>
      </div>
    </div>

    <div class="surface-card overflow-x-auto">
      <table class="crc-table w-full text-sm">
        <thead><tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide">
          <th class="px-3 py-2.5 font-medium">Vendor</th><th class="px-3 py-2.5 font-medium">Contract</th><th class="px-3 py-2.5 font-medium">Scope of work</th><th class="px-3 py-2.5 font-medium w-60">Linked to</th>
        </tr></thead>
        <tbody>
          @for (r of rows(); track r.key) {
            <tr class="border-t border-surface-border hover:bg-surface-subtle/40">
              <td class="px-3 py-2 text-ink-700">{{ r.vendorName }}</td>
              <td class="px-3 py-2 text-ink-700"><div>{{ r.contractRef }}</div><div class="text-[11px] text-ink-400">{{ r.contractName }}</div></td>
              <td class="px-3 py-2"><div class="text-ink-900 font-medium">{{ r.label }}</div><div class="text-[11px] text-ink-400">{{ r.scope }}</div></td>
              <td class="px-3 py-2">
                <select [class]="field" [value]="r.component ?? ''" (change)="link(r.key, $any($event.target).value)">
                  <option value="">Not linked — contract share</option>
                  @for (k of components; track k) { <option [value]="k">{{ label[k] }}</option> }
                </select>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="4" class="px-4 py-10 text-center text-sm text-ink-400">No lines match these filters.</td></tr>
          }
        </tbody>
      </table>
    </div>
    <p class="text-xs text-ink-400 mt-3 leading-relaxed">
      A line linked to a component is billed from that calculation on the billing contract (the vendor's active contract ending last) each month; every other line keeps taking its contract's monthly yearly-budget share.
      Changing a link clears validated invoices for the current period, so they are checked again against the new figure. See it in use on <a class="text-brand-600 font-medium" routerLink="/invoicing/reconciliation">Reconciliation Workspace</a>.
    </p>
  `,
  styles: [`.lbl { font-size: 10.5px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: .04em; }`],
})
export class LineMappingComponent {
  store = inject(CrcStore);
  private ui = inject(UiService);

  field = FIELD;
  components = WFO_COMPONENTS;
  label = WFO_LABEL;

  vendor = signal('All');
  contract = signal('All');
  linked = signal<'All' | 'Linked' | 'Unlinked'>('All');
  q = signal('');

  private catalog = computed(() => this.store.payableLineCatalog());
  vendors = computed(() => [...new Set(this.catalog().map((r) => r.vendorName))]);
  contracts = computed(() => [...new Set(this.catalog().filter((r) => this.vendor() === 'All' || r.vendorName === this.vendor()).map((r) => r.contractRef))]);

  rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.catalog().filter((r) =>
      (this.vendor() === 'All' || r.vendorName === this.vendor()) &&
      (this.contract() === 'All' || r.contractRef === this.contract()) &&
      (this.linked() === 'All' || (this.linked() === 'Linked') === (r.component !== null)) &&
      (!q || r.label.toLowerCase().includes(q) || r.scope.toLowerCase().includes(q)));
  });
  linkedCount = computed(() => this.rows().filter((r) => r.component !== null).length);

  clear() { this.vendor.set('All'); this.contract.set('All'); this.linked.set('All'); this.q.set(''); }

  link(key: string, value: string) {
    if (!this.ui.requires('Configure Payable Rules')) return;
    this.store.setLineMapping(key, (value || null) as WfoComponent | null);
    this.ui.toast(value ? `Linked to ${this.label[value as WfoComponent]}.` : 'Unlinked — back to its contract share.');
  }
}
