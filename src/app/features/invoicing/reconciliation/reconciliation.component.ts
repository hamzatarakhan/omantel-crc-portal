import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { RequiresDirective } from '../../../shared/directives/requires.directive';
import { CrcStore, PayableLineItem } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { InvoiceLineDetail, VendorQuery } from '../../../core/models/domain';
import { StatusLevel } from '../../../core/models/status';
import { statusLevelFor } from '../../../core/services/contract-monitoring';
import { AnnexureComponent } from './annexure.component';

const VENDORS = ['Infoline LLC', 'Green Umbrella Services'];
const VENDOR_CONTACT: Record<string, string> = { 'Infoline LLC': 'accounts@infoline.om', 'Green Umbrella Services': 'billing@greenumbrella.om' };
const FIELD = 'w-full h-9 px-2.5 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 focus:outline-none focus:border-brand-400';

/** Where a line is in its journey: validate it, then approve it if it matches — or email the vendor if it does not. */
type LineStatus = 'Not validated' | 'Matches' | 'Does not match' | 'Queried with vendor' | 'Approved for payment';
const STATUS_LEVEL: Record<LineStatus, StatusLevel> = { 'Not validated': 'neutral', Matches: 'normal', 'Does not match': 'red', 'Queried with vendor': 'amber', 'Approved for payment': 'info' };

@Component({
  selector: 'app-reconciliation',
  standalone: true,
  imports: [RequiresDirective, AnnexureComponent, CommonModule, FormsModule, RouterModule, MatIconModule, PageHeaderComponent, StatusChipComponent, KpiCardComponent],
  template: `
    <app-page-header
      title="Reconciliation Workspace"
      subtitle="Check what a vendor invoiced on a contract against our calculation, line by line — approve what matches, query the rest with the vendor"
      [breadcrumbs]="[{ label: 'Invoicing & Payments', link: '/invoicing/reconciliation' }, { label: 'Reconciliation Workspace' }]"
    >
      <span class="status-chip status-chip--neutral">{{ store.period() }}</span>
      <app-status-chip [label]="status()" [level]="statusLevel()"></app-status-chip>
    </app-page-header>

    <!-- 1. Pick the vendor and one of its contracts -->
    <div class="surface-card px-4 py-3.5 mb-4">
      <div class="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-end">
        <div>
          <div [class]="label">Vendor</div>
          <div class="inline-flex items-center gap-1 bg-surface-subtle border border-surface-border rounded-lg p-0.5">
            @for (v of vendors; track v) {
              <button type="button" (click)="vendor.set(v)" class="h-8 px-3 text-xs font-semibold rounded-md transition-colors" [class]="vendor() === v ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500 hover:text-ink-900'">{{ v }}</button>
            }
          </div>
        </div>
        <label class="block min-w-0">
          <span [class]="label">Contract</span>
          <select [class]="field" (change)="pickContract($any($event.target).value)" [disabled]="!contracts().length">
            @for (c of contracts(); track c.reference) {
              <option [value]="c.reference" [selected]="c.reference === contract()?.reference">{{ c.reference }} · {{ c.name }}{{ c.billing ? ' — agents billed here' : '' }}</option>
            } @empty { <option>No contract runs in {{ store.period() }}</option> }
          </select>
        </label>
        <div>
          <div [class]="label">View</div>
          <div class="inline-flex items-center gap-1 bg-surface-subtle border border-surface-border rounded-lg p-0.5">
            <button type="button" (click)="view.set('calc')" class="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-semibold rounded-md transition-colors" [class]="view() === 'calc' ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500 hover:text-ink-900'"><mat-icon class="!text-base !w-4 !h-4">calculate</mat-icon>Lines</button>
            <button type="button" (click)="view.set('annexure')" class="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-semibold rounded-md transition-colors" [class]="view() === 'annexure' ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500 hover:text-ink-900'"><mat-icon class="!text-base !w-4 !h-4">table_view</mat-icon>Annexure</button>
          </div>
        </div>
      </div>
      @if (contract(); as c) {
        <div class="flex items-center gap-x-4 gap-y-1.5 flex-wrap mt-3 pt-3 border-t border-surface-border text-xs text-ink-500">
          <app-status-chip [label]="c.status" [level]="contractLevel(c)"></app-status-chip>
          @if (c.billing) { <span class="inline-flex items-center gap-1 font-semibold text-brand-700"><mat-icon class="!text-sm !w-3.5 !h-3.5">groups</mat-icon>Agents' attendance is billed on this contract</span> }
          <span>PO <b class="text-ink-700">{{ c.poNumber || '—' }}</b></span>
          <span>{{ c.startDate }} &rarr; {{ c.endDate }}</span>
          <span>Value <b class="text-ink-700">{{ c.amount | number:'1.0-0' }} OMR</b></span>
          <span>Queries to <b class="text-ink-700">{{ vendorContact() }}</b></span>
          <a class="ml-auto inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline" [routerLink]="['/contracts-budget/contracts', c.id]">Open contract<mat-icon class="!text-sm !w-3.5 !h-3.5">open_in_new</mat-icon></a>
        </div>
      }
    </div>

    @if (view() === 'annexure') {
      <app-annexure [vendor]="vendor()"></app-annexure>
    } @else if (!contract()) {
      <div class="surface-card p-8 text-center text-sm text-ink-500">{{ vendor() }} has no contract running in {{ store.period() }}, so there is nothing to reconcile.</div>
    } @else {

    <!-- 2. Where this contract stands -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      <app-kpi-card label="Calculated" [value]="calculatedTotal() | number:'1.2-2'" unit="OMR" icon="calculate"></app-kpi-card>
      <app-kpi-card label="Vendor invoiced" [value]="vendorTotal() | number:'1.2-2'" unit="OMR" icon="receipt_long"></app-kpi-card>
      <app-kpi-card label="Difference" [value]="(diff() > 0 ? '+' : '') + (diff() | number:'1.2-2')" unit="OMR" icon="compare_arrows" [level]="diffLevel()"></app-kpi-card>
      <app-kpi-card label="Approved lines" [value]="approvedCount() + ' of ' + lines().length" icon="task_alt" [level]="approvedCount() === lines().length ? 'info' : 'neutral'"></app-kpi-card>
    </div>

    <!-- 3. The lines, with the bulk actions on top -->
    <div class="surface-card mb-4 overflow-hidden">
      <div class="flex items-center justify-between gap-3 flex-wrap px-4 py-3.5 border-b border-surface-border">
        <div class="min-w-0">
          <h3 class="text-[13.5px] font-bold text-ink-900">Payable lines &middot; {{ contract()?.reference }}</h3>
          <ol class="flex items-center gap-1.5 flex-wrap list-none p-0 m-0 mt-1 text-[11px] text-ink-400">
            <li><b class="text-ink-600">1</b> Enter the vendor's amount</li><li class="text-ink-300">›</li>
            <li><b class="text-ink-600">2</b> Validate</li><li class="text-ink-300">›</li>
            <li><b class="text-ink-600">3</b> Approve if it matches (within {{ store.payableRules().deviationPct }}%) — otherwise email the vendor</li>
          </ol>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <button type="button" [class]="btnSecondary" (click)="validate(validatable())" appRequires="Validate Invoice" [disabled]="!validatable().length"><mat-icon [class]="ico">fact_check</mat-icon>Validate selected @if (validatable().length) { <span [class]="pill">{{ validatable().length }}</span> }</button>
          <button type="button" [class]="btnPrimary" (click)="approve(approvable())" appRequires="Validate Invoice" [disabled]="!approvable().length"><mat-icon [class]="ico">task_alt</mat-icon>Approve selected @if (approvable().length) { <span class="bg-white/25 rounded-full px-1.5 text-[10px] leading-4">{{ approvable().length }}</span> }</button>
          <button type="button" [class]="btnDanger" (click)="emailVendor()" appRequires="Validate Invoice" [disabled]="!queryable().length"><mat-icon [class]="ico">mail</mat-icon>Email vendor @if (queryable().length) { <span class="bg-status-red text-white rounded-full px-1.5 text-[10px] leading-4">{{ queryable().length }}</span> }</button>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="crc-table w-full">
          <thead>
            <tr class="text-left">
              <th class="w-10"><input type="checkbox" class="w-4 h-4 accent-brand-600 align-middle cursor-pointer" [checked]="allSelected()" (change)="allSelected() ? selectNone() : selectAll()" [disabled]="!openLines().length" title="Select all open lines" /></th>
              <th>Line</th>
              <th class="text-right">Calculated (OMR)</th>
              <th class="text-right">Vendor invoice (OMR)</th>
              <th class="text-right">Difference</th>
              <th>Status</th>
              <th class="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            @for (l of lines(); track l.key) {
              <tr>
                <td>
                  @if (isApproved(l.key)) { <mat-icon class="!text-lg !w-[18px] !h-[18px] text-status-info align-middle" title="Approved">check_circle</mat-icon> }
                  @else { <input type="checkbox" class="w-4 h-4 accent-brand-600 align-middle cursor-pointer" [checked]="isSelected(l.key)" (change)="toggle(l.key)" /> }
                </td>
                <td class="!whitespace-normal min-w-[200px]">
                  <div class="font-semibold text-ink-900">{{ l.label }}</div>
                  <div class="text-[11px] mt-0.5" [class]="l.source === 'wfo' ? 'text-brand-700' : 'text-ink-400'">{{ l.source === 'wfo' ? 'Calculated from WFO attendance' : 'Contract monthly share' }}@if (l.note) { <span class="text-ink-400"> &middot; {{ l.note }}</span> }</div>
                </td>
                <td class="text-right font-medium text-ink-900 tabular-nums">{{ l.calculated | number:'1.2-2' }}</td>
                <td class="text-right"><input type="number" step="0.01" min="0" class="w-32 h-8 text-right text-sm font-medium tabular-nums bg-white border border-surface-border rounded-lg px-2.5 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-surface-subtle disabled:text-ink-500 disabled:border-transparent" [ngModel]="vendorAmount(l.key)" (ngModelChange)="setVendorAmount(l.key, +$event)" [disabled]="isApproved(l.key)" /></td>
                <td class="text-right">
                  <div class="font-semibold tabular-nums" [class]="diffClass(l)">{{ lineDiff(l) > 0 ? '+' : '' }}{{ lineDiff(l) | number:'1.2-2' }}</div>
                  @if (!same(l)) { <div class="text-[11px] text-ink-400">{{ lineDiff(l) > 0 ? 'Higher' : 'Lower' }} than ours &middot; {{ lineVariance(l) > 0 ? '+' : '' }}{{ lineVariance(l) | number:'1.1-1' }}%</div> }
                </td>
                <td class="!whitespace-normal">
                  <app-status-chip [label]="lineStatus(l.key)" [level]="statusLevels[lineStatus(l.key)]"></app-status-chip>
                  @if (lineStatus(l.key) === 'Queried with vendor') { <div class="text-[11px] text-ink-400 mt-1">Emailed {{ queriedAt(l.key) | date:'d MMM, HH:mm' }} — update the amount when they reply</div> }
                </td>
                <td class="text-right">
                  <div class="inline-flex items-center gap-1">
                    @switch (lineStatus(l.key)) {
                      @case ('Approved for payment') { <a routerLink="/invoicing/tracking" [class]="rowBtn + ' text-brand-700 hover:bg-brand-50'" title="Open the payment in PO & Payment Tracking"><mat-icon [class]="icoSm">receipt_long</mat-icon>{{ store.lineRun(vendor(), l.key)?.paymentId }}</a> }
                      @case ('Matches') { <button type="button" [class]="rowBtn + ' text-white bg-brand-600 hover:bg-brand-700'" (click)="approve([l.key])" appRequires="Validate Invoice"><mat-icon [class]="icoSm">task_alt</mat-icon>Approve</button> }
                      @case ('Does not match') { <button type="button" [class]="rowBtn + ' text-white bg-status-red hover:bg-red-700'" (click)="emailVendor(l.key)" appRequires="Validate Invoice"><mat-icon [class]="icoSm">mail</mat-icon>Email vendor</button> }
                      @case ('Queried with vendor') { <button type="button" [class]="rowBtn + ' text-status-red border border-solid border-red-200 bg-white hover:bg-red-50'" (click)="emailVendor(l.key)" appRequires="Validate Invoice"><mat-icon [class]="icoSm">forward_to_inbox</mat-icon>Email again</button> }
                      @default { <button type="button" [class]="rowBtn + ' text-brand-700 border border-solid border-brand-200 bg-white hover:bg-brand-50'" (click)="validate([l.key])" appRequires="Validate Invoice"><mat-icon [class]="icoSm">fact_check</mat-icon>Validate</button> }
                    }
                    <button type="button" [class]="iconBtn" (click)="toggleExpand(l.key)" [title]="isExpanded(l.key) ? 'Hide how it was calculated' : 'Show how it was calculated'"><mat-icon class="!text-lg !w-[18px] !h-[18px] transition-transform" [class.rotate-180]="isExpanded(l.key)">expand_more</mat-icon></button>
                  </div>
                </td>
              </tr>
              @if (isExpanded(l.key)) {
                <tr>
                  <td class="!border-t-0 !bg-surface-subtle"></td>
                  <td colspan="6" class="!border-t-0 !bg-surface-subtle !whitespace-normal !pt-0">
                    @if (l.source === 'wfo') {
                      <div class="max-w-xl text-xs text-ink-500 bg-white border border-surface-border rounded-lg px-3 py-1.5">
                        @for (b of breakdown(l); track b.label) {
                          <div class="flex justify-between gap-4 py-1.5 border-b border-surface-border last:border-0"><span>{{ b.label }}</span><span class="font-medium text-ink-800 tabular-nums">{{ b.amount | number:'1.2-2' }}</span></div>
                        }
                      </div>
                      <p class="text-[11px] text-ink-400 mt-2">
                        @switch (l.component) {
                          @case ('performance') { Calls shorter than {{ calc().threshold }}s don't count — <a class="text-brand-600 font-medium" routerLink="/invoicing/rules">change the rule</a>. }
                          @case ('fee') { The contract's flat management fee per agent per month. }
                          @default { Billing rate &times; billable-day ratio per agent, from the <a class="text-brand-600 font-medium" routerLink="/csr/leave">attendance sheet</a> and the <button type="button" class="text-brand-600 font-medium" (click)="view.set('annexure')">annexure</button>. Absence is deducted; approved leave stays billable. }
                        }
                      </p>
                    } @else {
                      <p class="text-xs text-ink-500">{{ l.basis }}. The vendor bills this line from the contract; there is nothing to recalculate from attendance.</p>
                    }
                  </td>
                </tr>
              }
            } @empty {
              <tr><td colspan="7" class="!text-center text-sm text-ink-400 !py-8">This contract has no lines to pay in {{ store.period() }}.</td></tr>
            }
          </tbody>
          <tfoot>
            <tr class="font-semibold text-ink-900">
              <td></td>
              <td>Total &middot; {{ lines().length }} line{{ lines().length === 1 ? '' : 's' }}</td>
              <td class="text-right tabular-nums">{{ calculatedTotal() | number:'1.2-2' }}</td>
              <td class="text-right tabular-nums">{{ vendorTotal() | number:'1.2-2' }}</td>
              <td class="text-right tabular-nums" [class]="diffLevel() === 'normal' ? 'text-status-normal' : diffLevel() === 'red' ? 'text-status-red' : 'text-ink-400'">{{ diff() > 0 ? '+' : '' }}{{ diff() | number:'1.2-2' }}</td>
              <td colspan="2" class="text-right text-xs font-medium text-ink-400">{{ approvedCount() }} of {{ lines().length }} approved</td>
            </tr>
          </tfoot>
        </table>
      </div>

      @if (queries().length) {
        <div class="border-t border-surface-border px-4 py-3 text-xs text-ink-500">
          <div class="font-semibold text-ink-700 mb-1">Emails sent about {{ contract()?.reference }} for {{ store.period() }}</div>
          @for (q of queries(); track q.id) {
            <div class="flex items-start gap-1.5 py-0.5"><mat-icon class="!text-sm !w-3.5 !h-3.5 mt-0.5 shrink-0">mail_outline</mat-icon><span>{{ q.sentAt | date:'d MMM, HH:mm' }} to {{ q.to }} &middot; {{ lineNames(q) }} &middot; &ldquo;{{ q.comment }}&rdquo;</span></div>
          }
        </div>
      }
    </div>
    @if (approvedCount()) { <p class="text-xs text-ink-400 mb-4">Approved lines are paid from <a class="text-brand-600 font-medium" routerLink="/invoicing/tracking">PO &amp; Payment Tracking</a>.</p> }
    }
  `,
})
export class ReconciliationComponent {
  store = inject(CrcStore);
  private ui = inject(UiService);

  readonly vendors = VENDORS;
  readonly field = FIELD;
  readonly statusLevels = STATUS_LEVEL;
  readonly label = 'block text-[10.5px] font-bold text-ink-400 uppercase tracking-wide mb-1';
  readonly ico = '!text-[17px] !w-[17px] !h-[17px]';
  readonly icoSm = '!text-base !w-4 !h-4';
  readonly pill = 'bg-brand-600 text-white rounded-full px-1.5 text-[10px] leading-4';
  readonly btnBase = 'inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold rounded-lg active:scale-[0.97] transition-all disabled:opacity-40 disabled:pointer-events-none';
  readonly btnSecondary = this.btnBase + ' border border-solid border-brand-100 bg-brand-50 text-brand-700 hover:bg-brand-100 hover:border-brand-200';
  readonly btnPrimary = this.btnBase + ' bg-brand-600 text-white hover:bg-brand-700';
  readonly btnDanger = this.btnBase + ' border border-solid border-red-200 bg-white text-status-red hover:bg-red-50';
  readonly rowBtn = 'inline-flex items-center justify-center gap-1 h-8 min-w-[112px] px-2.5 text-xs font-semibold rounded-lg transition-colors';
  readonly iconBtn = 'w-8 h-8 inline-flex items-center justify-center rounded-lg text-ink-400 hover:bg-surface-subtle hover:text-ink-700 transition-colors';

  vendor = signal(VENDORS[0]);
  view = signal<'calc' | 'annexure'>('calc');
  private contractByVendor = signal<Record<string, string>>({});
  private selectedBy = signal<Record<string, Set<string>>>({});
  private typed = signal<Record<string, number>>({});
  private expandedKeys = signal<Set<string>>(new Set());

  contracts = computed(() => this.store.payableContracts(this.vendor()));
  contract = computed(() => { const list = this.contracts(); return list.find((c) => c.reference === this.contractByVendor()[this.vendor()]) ?? list[0]; });
  private ctx = computed(() => `${this.vendor()}|${this.contract()?.reference}`);
  calc = computed(() => this.store.calculateInvoice(this.vendor()));
  lines = computed<PayableLineItem[]>(() => { const c = this.contract(); return c ? this.store.payableLines(this.vendor(), c.reference) : []; });
  vendorContact = computed(() => VENDOR_CONTACT[this.vendor()] ?? 'accounts@vendor.example');
  queries = computed(() => this.store.vendorQueries().filter((q) => q.vendor === this.vendor() && q.contract === this.contract()?.reference && q.period === this.store.period()));

  openLines = computed(() => this.lines().filter((l) => !this.isApproved(l.key)));
  selected = computed(() => this.selectedBy()[this.ctx()] ?? new Set(this.openLines().map((l) => l.key)));
  allSelected = computed(() => this.openLines().length > 0 && this.openLines().every((l) => this.selected().has(l.key)));
  validatable = computed(() => this.openLines().filter((l) => this.isSelected(l.key)).map((l) => l.key));
  approvable = computed(() => this.validatable().filter((k) => this.lineStatus(k) === 'Matches'));
  queryable = computed(() => this.lines().filter((l) => this.lineStatus(l.key) === 'Does not match' || this.lineStatus(l.key) === 'Queried with vendor'));
  approvedCount = computed(() => this.lines().length - this.openLines().length);

  calculatedTotal = computed(() => this.lines().reduce((s, l) => s + l.calculated, 0));
  vendorTotal = computed(() => this.lines().reduce((s, l) => s + this.vendorAmount(l.key), 0));
  diff = computed(() => this.vendorTotal() - this.calculatedTotal());
  diffLevel = computed<StatusLevel>(() => {
    const t = this.calculatedTotal(), d = this.diff();
    if (Math.abs(d) < 0.005) return 'neutral';
    return t && Math.abs(d / t) * 100 <= this.store.payableRules().deviationPct ? 'normal' : 'red';
  });

  status = computed(() => {
    const n = this.lines().length, done = this.approvedCount();
    if (!n) return 'Nothing to reconcile';
    if (done === n) return 'Approved for payment';
    if (done) return `${done} of ${n} approved`;
    return this.lines().some((l) => this.lineStatus(l.key) !== 'Not validated') ? 'In validation' : 'Not started';
  });
  statusLevel = computed<StatusLevel>(() => (this.status() === 'Approved for payment' ? 'info' : this.status() === 'Not started' || this.status() === 'Nothing to reconcile' ? 'neutral' : 'amber'));

  contractLevel(c: { endDate: string; status: string; daysRemaining: number }) {
    return statusLevelFor(c as any);
  }

  pickContract(ref: string) {
    this.contractByVendor.update((m) => ({ ...m, [this.vendor()]: ref }));
  }

  // ---------- per line ----------
  isApproved(key: string) {
    return this.store.lineRun(this.vendor(), key)?.status === 'Approved for payment';
  }

  isSelected(key: string) {
    return this.selected().has(key);
  }

  toggle(key: string) {
    const next = new Set(this.selected());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.selectedBy.update((m) => ({ ...m, [this.ctx()]: next }));
  }

  selectAll() {
    this.selectedBy.update((m) => ({ ...m, [this.ctx()]: new Set(this.openLines().map((l) => l.key)) }));
  }

  selectNone() {
    this.selectedBy.update((m) => ({ ...m, [this.ctx()]: new Set<string>() }));
  }

  isExpanded(key: string) {
    return this.expandedKeys().has(key);
  }

  toggleExpand(key: string) {
    const next = new Set(this.expandedKeys());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.expandedKeys.set(next);
  }

  vendorAmount(key: string): number {
    const run = this.store.lineRun(this.vendor(), key);
    if (run?.status === 'Approved for payment') return run.lines[0].vendorAmount;
    const typed = this.typed()[key];
    if (typed !== undefined) return typed;
    return this.lines().find((l) => l.key === key)?.calculated ?? 0;
  }

  setVendorAmount(key: string, v: number) {
    this.typed.update((m) => ({ ...m, [key]: Number.isFinite(v) ? v : 0 }));
  }

  lineDiff(l: PayableLineItem) {
    return this.vendorAmount(l.key) - l.calculated;
  }

  lineVariance(l: PayableLineItem) {
    return l.calculated ? (this.lineDiff(l) / l.calculated) * 100 : 0;
  }

  same(l: PayableLineItem) {
    return Math.abs(this.lineDiff(l)) < 0.005;
  }

  diffClass(l: PayableLineItem) {
    if (this.same(l)) return 'text-ink-400';
    return Math.abs(this.lineVariance(l)) <= this.store.payableRules().deviationPct ? 'text-status-amber' : 'text-status-red';
  }

  /** A validation only counts while the amounts it checked are still the ones on screen. */
  lineStatus(key: string): LineStatus {
    const run = this.store.lineRun(this.vendor(), key);
    if (!run) return 'Not validated';
    if (run.status === 'Approved for payment') return run.status;
    const checked = run.lines[0], now = this.lines().find((x) => x.key === key);
    if (!now || Math.abs(checked.vendorAmount - this.vendorAmount(key)) >= 0.005 || Math.abs(checked.calculated - now.calculated) >= 0.005) return 'Not validated';
    if (run.status === 'Validated') return 'Matches';
    return this.lastQuery(key, checked) ? 'Queried with vendor' : 'Does not match';
  }

  private lastQuery(key: string, checked: InvoiceLineDetail) {
    return this.queries().find((q) => q.lines.some((x) => x.key === key && Math.abs(x.vendorAmount - checked.vendorAmount) < 0.005 && Math.abs(x.calculated - checked.calculated) < 0.005));
  }

  queriedAt(key: string) {
    const run = this.store.lineRun(this.vendor(), key);
    return run ? this.lastQuery(key, run.lines[0])?.sentAt : undefined;
  }

  lineNames(q: VendorQuery) {
    return q.lines.map((l) => l.label).join(', ');
  }

  /** How a WFO-calculated line's number was built up. */
  breakdown(l: PayableLineItem): Array<{ label: string; amount: number }> {
    const c = this.calc();
    const fee = c.tiers.reduce((s, t) => s + t.fee, 0);
    switch (l.component) {
      case 'salary': return [
        ...c.tiers.map((t) => ({ label: `${t.degree} tier · ${t.headcount} agents · ${t.billableFte.toFixed(2)} billable FTE`, amount: t.salaryAmount })),
        { label: `New joiners · ${c.newJoining.units} · pro-rata`, amount: c.newJoining.amount },
        { label: `Resignations · ${c.resignation.units} · pro-rata + leave encashment`, amount: c.resignation.amount },
        ...(this.lines().some((x) => x.component === 'fee') ? [{ label: 'Less the management fee, billed on its own line', amount: -fee }] : []),
      ];
      case 'overtime': return c.tiers.map((t) => ({ label: `${t.degree} tier · ${t.headcount} agents`, amount: t.overtime }));
      case 'fee': return c.tiers.map((t) => ({ label: `${t.degree} tier · ${t.headcount} agents`, amount: t.fee }));
      default: return [{ label: `${c.eligibleCalls.toLocaleString()} eligible calls (of ${c.sampleCalls.toLocaleString()}) × 0.05 OMR`, amount: c.incentive }];
    }
  }

  private details(keys: string[]): InvoiceLineDetail[] {
    return this.lines().filter((l) => keys.includes(l.key)).map((l) => ({ key: l.key, label: l.label, calculated: l.calculated, vendorAmount: this.vendorAmount(l.key) }));
  }

  // ---------- actions ----------
  validate(keys: string[]) {
    if (!this.ui.requires('Validate Invoice')) return;
    const runs = this.store.validateLines(this.vendor(), this.details(keys));
    if (!runs.length) return;
    const off = runs.filter((r) => r.status === 'Flagged for review').map((r) => r.lines[0].label);
    const what = runs.length === 1 ? runs[0].lines[0].label : `${runs.length} lines`;
    this.ui.toast(off.length ? `${what} validated — ${off.join(', ')} ${off.length === 1 ? 'does' : 'do'} not match. Email the vendor with the details.` : `${what} validated — ready to approve.`, 5000);
  }

  async approve(keys: string[]) {
    if (!this.ui.requires('Validate Invoice')) return;
    const c = this.contract();
    const ok = keys.filter((k) => this.lineStatus(k) === 'Matches');
    if (!c || !ok.length) return;
    const d = this.details(ok);
    const names = d.map((l) => l.label).join(', ');
    const total = Math.round(d.reduce((s, l) => s + l.vendorAmount, 0)).toLocaleString();
    const yes = await this.ui.confirm({
      title: ok.length === 1 ? `Approve ${names} for payment?` : `Approve ${ok.length} lines for payment?`,
      message: `One payment of ${total} OMR on ${c.reference} (${names}) is created and tracked from Pending.`,
      confirmLabel: 'Approve', icon: 'payments',
    });
    if (!yes) return;
    const p = this.store.approveLines(this.vendor(), ok, c.reference);
    this.ui.toast(`Approved — ${p?.id} added to PO & Payment Tracking.`);
  }

  /** One email to the vendor: each chosen line with what they invoiced and what we calculated, then the user's comment. */
  async emailVendor(onlyKey?: string) {
    if (!this.ui.requires('Validate Invoice')) return;
    const c = this.contract();
    const candidates = this.queryable();
    if (!c || !candidates.length) return;
    const fmt = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const v = await this.ui.form({
      title: `Email ${this.vendor()}`,
      subtitle: `${c.reference} · ${this.store.period()} · the email lists each chosen line with the amount they invoiced and the amount we calculated, then your comment`,
      icon: 'mail',
      submitLabel: 'Send email',
      values: { to: this.vendorContact(), subject: `Invoice query — ${c.reference} — ${this.store.period()}`, lines: onlyKey ? [onlyKey] : candidates.map((l) => l.key), comment: '' },
      fields: [
        { key: 'to', label: 'To', type: 'email', required: true },
        { key: 'subject', label: 'Subject', required: true },
        { key: 'lines', label: 'Lines that do not match', type: 'multiselect', options: candidates.map((l) => ({ value: l.key, label: `${l.label} — invoiced ${fmt(this.vendorAmount(l.key))} · calculated ${fmt(l.calculated)}` })) },
        { key: 'comment', label: 'Comment', type: 'textarea', required: true, placeholder: 'e.g. Please re-issue the invoice with the calculated amounts, or send the supporting sheet for the difference.' },
      ],
    });
    if (!v) return;
    const lines = this.details(v['lines'] ?? []);
    if (!lines.length) { this.ui.toast('Pick at least one line to query.'); return; }
    this.store.queryVendor({ vendor: this.vendor(), contract: c.reference, period: this.store.period(), lines, to: v['to'], subject: v['subject'], comment: v['comment'] });
    this.ui.toast(`Email sent to ${v['to']}.`);
  }
}
