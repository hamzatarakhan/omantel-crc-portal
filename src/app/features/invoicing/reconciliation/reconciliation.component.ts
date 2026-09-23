import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { InvoiceLineDetail, VendorQuery } from '../../../core/models/domain';
import { StatusLevel } from '../../../core/models/status';
import { AnnexureComponent } from './annexure.component';

const VENDORS = ['Infoline LLC', 'Green Umbrella Services'];
const VENDOR_CONTACT: Record<string, string> = { 'Infoline LLC': 'accounts@infoline.om', 'Green Umbrella Services': 'billing@greenumbrella.om' };
type LineState = 'match' | 'over' | 'under';
type LineStatus = 'Not validated' | 'Validated' | 'Flagged for review' | 'Approved for payment';
const LINE_STATUS_LEVEL: Record<LineStatus, StatusLevel> = { 'Not validated': 'neutral', Validated: 'normal', 'Flagged for review': 'red', 'Approved for payment': 'info' };
const STATE_META: Record<LineState, { label: string; level: StatusLevel }> = {
  match: { label: 'Matches', level: 'normal' },
  over: { label: 'Higher than ours', level: 'red' },
  under: { label: 'Lower than ours', level: 'amber' },
};

import { RequiresDirective } from '../../../shared/directives/requires.directive';

@Component({
  selector: 'app-reconciliation',
  standalone: true,
  imports: [RequiresDirective, AnnexureComponent, CommonModule, FormsModule, RouterModule, MatButtonModule, MatIconModule, PageHeaderComponent, StatusChipComponent],
  template: `
    <app-page-header
      title="Reconciliation Workspace"
      subtitle="Payable calculation from synced WFO attendance/overtime + 3 Clicks incentives, for validating the vendor invoice line by line"
      [breadcrumbs]="[{ label: 'Invoicing & Payments', link: '/invoicing/reconciliation' }, { label: 'Reconciliation Workspace' }]"
    >
      <span class="status-chip status-chip--neutral">{{ store.period() }}</span>
      <app-status-chip [label]="status()" [level]="statusLevel()"></app-status-chip>
    </app-page-header>

    <div class="flex items-stretch gap-3 flex-wrap mb-1">
      <div class="flex items-center gap-1 bg-white border border-surface-border rounded-lg p-0.5">
        @for (v of vendors; track v) {
          <button (click)="pickVendor(v)" class="h-8 inline-flex items-center px-3 text-xs font-semibold rounded-md transition-colors" [class]="vendor() === v ? 'bg-brand-50 text-brand-700' : 'text-ink-500 hover:text-ink-900'">{{ v }}</button>
        }
      </div>
      <div class="flex items-center gap-1 bg-white border border-surface-border rounded-lg p-0.5">
        <button (click)="view.set('calc')" class="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-semibold rounded-md transition-colors" [class]="view() === 'calc' ? 'bg-brand-50 text-brand-700' : 'text-ink-500 hover:text-ink-900'"><mat-icon class="!text-base">calculate</mat-icon>Calculation</button>
        <button (click)="view.set('annexure')" class="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-semibold rounded-md transition-colors" [class]="view() === 'annexure' ? 'bg-brand-50 text-brand-700' : 'text-ink-500 hover:text-ink-900'"><mat-icon class="!text-base">table_view</mat-icon>Annexure</button>
      </div>
    </div>
    <p class="text-xs text-ink-400 mb-4">Vendor contact for queries: <span class="font-medium text-ink-600">{{ vendorContact() }}</span></p>

    @if (view() === 'annexure') {
      <app-annexure [vendor]="vendor()"></app-annexure>
    } @else {
    <div class="surface-card mb-4 overflow-hidden">
      <!-- Toolbar: what the table is, then the bulk actions for the ticked lines -->
      <div class="flex items-center justify-between gap-3 flex-wrap px-4 py-3.5 border-b border-surface-border">
        <div class="min-w-0">
          <h3 class="text-[13.5px] font-bold text-ink-900">Payable lines</h3>
          <p class="text-xs text-ink-400 mt-0.5">{{ !openLines().length ? 'Every line is approved for payment.' : validatable().length ? validatable().length + ' of ' + openLines().length + ' open line' + (openLines().length === 1 ? '' : 's') + ' selected' : 'Enter what ' + vendor() + ' invoiced, then validate and approve each line — or tick several and do them together.' }}</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <button type="button" [class]="btnSecondary" (click)="validate(validatable())" appRequires="Validate Invoice" [disabled]="!validatable().length"><mat-icon class="!text-[17px] !w-[17px] !h-[17px]">fact_check</mat-icon>Validate selected @if (validatable().length) { <span [class]="countPill">{{ validatable().length }}</span> }</button>
          <button type="button" [class]="btnPrimary" (click)="approve(approvable())" appRequires="Validate Invoice" [disabled]="!approvable().length"><mat-icon class="!text-[17px] !w-[17px] !h-[17px]">task_alt</mat-icon>Approve selected @if (approvable().length) { <span class="bg-white/25 rounded-full px-1.5 text-[10px] leading-4">{{ approvable().length }}</span> }</button>
          <span class="w-px h-6 bg-surface-border mx-1 hidden sm:block"></span>
          <button type="button" [class]="btnSecondary" (click)="emailVendor()" appRequires="Validate Invoice" [disabled]="!mismatched().length"><mat-icon class="!text-[17px] !w-[17px] !h-[17px]">mail</mat-icon>Email vendor @if (mismatched().length) { <span [class]="countPill">{{ mismatched().length }}</span> }</button>
          @if (approvedCount()) { <a routerLink="/invoicing/tracking" [class]="btnSecondary"><mat-icon class="!text-[17px] !w-[17px] !h-[17px]">view_kanban</mat-icon>Payments</a> }
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="crc-table w-full">
          <thead>
            <tr class="text-left">
              <th class="w-10"><input type="checkbox" class="w-4 h-4 accent-brand-600 align-middle cursor-pointer disabled:cursor-not-allowed" [checked]="allSelected()" (change)="allSelected() ? selectNone() : selectAll()" [disabled]="!openLines().length" title="Select all open lines" /></th>
              <th>Line</th>
              <th class="text-right">Calculated (OMR)</th>
              <th class="text-right">Vendor invoice (OMR)</th>
              <th class="text-right">Difference</th>
              <th>Status</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (l of lines(); track l.key) {
              <tr [class.opacity-80]="isApproved(l.key)">
                <td>
                  @if (isApproved(l.key)) { <mat-icon class="!text-lg !w-[18px] !h-[18px] text-status-info align-middle" title="Approved">check_circle</mat-icon> }
                  @else { <input type="checkbox" class="w-4 h-4 accent-brand-600 align-middle cursor-pointer" [checked]="isSelected(l.key)" (change)="toggle(l.key)" /> }
                </td>
                <td class="!whitespace-normal min-w-[180px]"><div class="font-semibold text-ink-900">{{ l.label }}</div>@if (l.note) { <div class="text-[11px] text-ink-400 mt-0.5">{{ l.note }}</div> }</td>
                <td class="text-right font-medium text-ink-900 tabular-nums">{{ l.calculated | number:'1.2-2' }}</td>
                <td class="text-right"><input type="number" step="0.01" class="w-32 h-8 text-right text-sm font-medium tabular-nums bg-white border border-surface-border rounded-lg px-2.5 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-surface-subtle disabled:text-ink-500 disabled:border-transparent" [ngModel]="vendorAmount(l.key)" (ngModelChange)="setVendorAmount(l.key, +$event)" [disabled]="isApproved(l.key)" /></td>
                <td class="text-right">
                  <div class="font-semibold tabular-nums" [class]="lineState(l) === 'match' ? 'text-ink-400' : lineWithinTolerance(l) ? 'text-status-amber' : 'text-status-red'">{{ lineDiff(l) > 0 ? '+' : '' }}{{ lineDiff(l) | number:'1.2-2' }}</div>
                  <div class="text-[11px]" [class]="lineState(l) === 'match' ? 'text-status-normal' : 'text-ink-400'">{{ stateMeta[lineState(l)].label }}@if (lineState(l) !== 'match') { &middot; {{ lineVariance(l) > 0 ? '+' : '' }}{{ lineVariance(l) | number:'1.1-1' }}% }</div>
                </td>
                <td>
                  <app-status-chip [label]="lineStatus(l.key)" [level]="statusLevels[lineStatus(l.key)]"></app-status-chip>
                </td>
                <td class="text-right">
                  <div class="inline-flex items-center gap-1">
                    @if (isApproved(l.key)) {
                      <a routerLink="/invoicing/tracking" [class]="rowBtn + ' text-brand-700 hover:bg-brand-50'" title="Open the payment in PO & Payment Tracking"><mat-icon class="!text-base !w-4 !h-4">receipt_long</mat-icon>{{ store.lineRun(vendor(), l.key)?.paymentId }}</a>
                    } @else if (lineStatus(l.key) === 'Not validated') {
                      <button type="button" [class]="rowBtn + ' text-brand-700 border border-solid border-brand-200 bg-white hover:bg-brand-50'" (click)="validate([l.key])" appRequires="Validate Invoice"><mat-icon class="!text-base !w-4 !h-4">fact_check</mat-icon>Validate</button>
                    } @else {
                      <button type="button" [class]="rowBtn + ' text-white bg-brand-600 hover:bg-brand-700'" (click)="approve([l.key])" appRequires="Validate Invoice"><mat-icon class="!text-base !w-4 !h-4">task_alt</mat-icon>Approve</button>
                    }
                    <button type="button" [class]="iconBtn" [class.invisible]="lineState(l) === 'match' || isApproved(l.key)" (click)="emailVendor(l.key)" title="Email the vendor about this line"><mat-icon class="!text-lg !w-[18px] !h-[18px]">mail_outline</mat-icon></button>
                    <button type="button" [class]="iconBtn" (click)="toggleExpand(l.key)" [title]="isExpanded(l.key) ? 'Hide calculation' : 'Show calculation'"><mat-icon class="!text-lg !w-[18px] !h-[18px] transition-transform" [class.rotate-180]="isExpanded(l.key)">expand_more</mat-icon></button>
                  </div>
                </td>
              </tr>
              @if (isExpanded(l.key)) {
                <tr>
                  <td class="!border-t-0 !bg-surface-subtle"></td>
                  <td colspan="6" class="!border-t-0 !bg-surface-subtle !whitespace-normal !pt-0">
                    <div class="max-w-xl text-xs text-ink-500 bg-white border border-surface-border rounded-lg px-3 py-1.5">
                      @for (b of breakdown(l.key); track b.label) {
                        <div class="flex justify-between gap-4 py-1.5 border-b border-surface-border last:border-0"><span>{{ b.label }}</span><span class="font-medium text-ink-800 tabular-nums">{{ b.amount | number:'1.2-2' }}</span></div>
                      }
                    </div>
                    <p class="text-[11px] text-ink-400 mt-2">
                      @switch (l.key) {
                        @case ('salary') { Billing rate &times; billable-day ratio per agent, from the <a class="text-brand-600 font-medium" routerLink="/csr/leave">attendance sheet</a>. Absence is deducted; approved leave stays billable. }
                        @case ('overtime') { Each agent's overtime allowance from the monthly annexure, adjusted for billable days like salary. }
                        @case ('performance') { {{ calc().eligibleCalls | number }} eligible calls &times; 0.05 OMR. Calls shorter than {{ calc().threshold }}s don't count — <a class="text-brand-600 font-medium" routerLink="/invoicing/rules">change the rule</a>. }
                      }
                    </p>
                  </td>
                </tr>
              }
            }
          </tbody>
          <tfoot>
            <tr class="font-semibold text-ink-900">
              <td></td>
              <td>Total &middot; {{ lines().length }} line{{ lines().length === 1 ? '' : 's' }}</td>
              <td class="text-right tabular-nums">{{ calculatedTotal() | number:'1.2-2' }}</td>
              <td class="text-right tabular-nums">{{ vendorTotal() | number:'1.2-2' }}</td>
              <td class="text-right tabular-nums" [class]="withinTolerance() ? 'text-status-normal' : 'text-status-red'">{{ diff() > 0 ? '+' : '' }}{{ diff() | number:'1.2-2' }} <span class="text-[11px] font-medium">({{ variance() > 0 ? '+' : '' }}{{ variance() | number:'1.1-1' }}%)</span></td>
              <td colspan="2" class="text-right text-xs font-medium text-ink-400">{{ approvedCount() }} of {{ lines().length }} approved</td>
            </tr>
          </tfoot>
        </table>
      </div>

      @if (queries().length) {
        <div class="border-t border-surface-border px-4 py-3 text-xs text-ink-500">
          <div class="font-semibold text-ink-700 mb-1">Emails sent to {{ vendor() }} for {{ store.period() }}</div>
          @for (q of queries(); track q.id) {
            <div class="flex items-start gap-1.5 py-0.5"><mat-icon class="!text-sm !w-3.5 !h-3.5 mt-0.5 shrink-0">mail_outline</mat-icon><span>{{ q.sentAt | date:'d MMM, HH:mm' }} to {{ q.to }} &middot; {{ lineNames(q) }} &middot; &ldquo;{{ q.comment }}&rdquo;</span></div>
          }
        </div>
      }
    </div>
    }
  `,
})
export class ReconciliationComponent {
  store = inject(CrcStore);
  private ui = inject(UiService);

  vendors = VENDORS;
  vendor = signal(VENDORS[0]);
  view = signal<'calc' | 'annexure'>('calc');
  private selectedByVendor = signal<Record<string, Set<string>>>({});
  private typed = signal<Record<string, Record<string, number>>>({});
  private expandedKeys = signal<Set<string>>(new Set());

  calc = computed(() => this.store.calculateInvoice(this.vendor()));
  lines = computed(() => this.store.payableLines(this.vendor()));
  selected = computed(() => this.selectedByVendor()[this.vendor()] ?? new Set(this.lines().map((l) => l.key)));
  allSelected = computed(() => this.openLines().length > 0 && this.openLines().every((l) => this.selected().has(l.key)));
  mismatched = computed(() => this.lines().filter((l) => this.lineState(l) !== 'match'));
  queries = computed(() => this.store.vendorQueries().filter((q) => q.vendor === this.vendor() && q.period === this.store.period()));

  statusLevels = LINE_STATUS_LEVEL;
  readonly btnSecondary = 'inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold rounded-lg border border-solid border-brand-100 bg-brand-50 text-brand-700 hover:bg-brand-100 hover:border-brand-200 active:scale-[0.97] transition-all disabled:opacity-40 disabled:pointer-events-none';
  readonly btnPrimary = 'inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 active:scale-[0.97] transition-all disabled:opacity-40 disabled:pointer-events-none';
  readonly countPill = 'bg-brand-600 text-white rounded-full px-1.5 text-[10px] leading-4';
  readonly rowBtn = 'inline-flex items-center justify-center gap-1 h-8 min-w-[92px] px-2.5 text-xs font-semibold rounded-lg transition-colors';
  readonly iconBtn = 'w-8 h-8 inline-flex items-center justify-center rounded-lg text-ink-400 hover:bg-surface-subtle hover:text-ink-700 transition-colors';
  /** Lines not yet approved — the only ones that can still be ticked, edited or validated. */
  openLines = computed(() => this.lines().filter((l) => !this.isApproved(l.key)));
  validatable = computed(() => this.openLines().filter((l) => this.isSelected(l.key)).map((l) => l.key));
  approvable = computed(() => this.validatable().filter((k) => this.lineStatus(k) === 'Validated' || this.lineStatus(k) === 'Flagged for review'));
  approvedCount = computed(() => this.lines().length - this.openLines().length);
  status = computed(() => {
    const n = this.lines().length, done = this.approvedCount();
    if (done === n) return 'Approved for payment';
    if (done) return `${done} of ${n} approved`;
    return this.lines().some((l) => this.lineStatus(l.key) !== 'Not validated') ? 'In validation' : 'Not started';
  });
  statusLevel = computed<StatusLevel>(() => (this.status() === 'Approved for payment' ? 'info' : this.status() === 'Not started' ? 'neutral' : 'amber'));

  isApproved(key: string) {
    return this.store.lineRun(this.vendor(), key)?.status === 'Approved for payment';
  }

  /** A validation only counts while the amounts it checked are still the ones on screen. */
  lineStatus(key: string): LineStatus {
    const run = this.store.lineRun(this.vendor(), key);
    if (!run) return 'Not validated';
    if (run.status === 'Approved for payment') return run.status;
    const l = run.lines[0], now = this.lines().find((x) => x.key === key);
    const same = !!now && Math.abs(l.vendorAmount - this.vendorAmount(key)) < 0.005 && Math.abs(l.calculated - now.calculated) < 0.005;
    return same ? (run.status as LineStatus) : 'Not validated';
  }

  isSelected(key: string) {
    return this.selected().has(key);
  }

  toggle(key: string) {
    if (this.isApproved(key)) return;
    const next = new Set(this.selected());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.selectedByVendor.update((m) => ({ ...m, [this.vendor()]: next }));
  }

  pickVendor(v: string) {
    this.vendor.set(v);
  }

  selectAll() {
    this.selectedByVendor.update((m) => ({ ...m, [this.vendor()]: new Set(this.openLines().map((l) => l.key)) }));
  }

  selectNone() {
    this.selectedByVendor.update((m) => ({ ...m, [this.vendor()]: new Set<string>() }));
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
    const typedVal = this.typed()[this.vendor()]?.[key];
    if (typedVal !== undefined) return typedVal;
    return Math.round((this.lines().find((l) => l.key === key)?.calculated ?? 0) * 100) / 100;
  }

  setVendorAmount(key: string, v: number) {
    this.typed.update((m) => ({ ...m, [this.vendor()]: { ...m[this.vendor()], [key]: v } }));
  }

  stateMeta = STATE_META;

  lineDiff(l: { key: string; calculated: number }): number {
    return this.vendorAmount(l.key) - l.calculated;
  }

  lineVariance(l: { key: string; calculated: number }): number {
    return l.calculated ? (this.lineDiff(l) / l.calculated) * 100 : 0;
  }

  lineWithinTolerance(l: { key: string; calculated: number }): boolean {
    return Math.abs(this.lineVariance(l)) <= this.store.payableRules().deviationPct;
  }

  lineState(l: { key: string; calculated: number }): LineState {
    const diff = this.lineDiff(l);
    return Math.abs(diff) < 0.005 ? 'match' : diff > 0 ? 'over' : 'under';
  }

  vendorContact = computed(() => VENDOR_CONTACT[this.vendor()] ?? 'accounts@vendor.example');
  lineNames(q: VendorQuery) {
    return q.lines.map((l) => l.label).join(', ');
  }

  /** How a line's number was built up, shown under the row. */
  breakdown(key: string): Array<{ label: string; amount: number }> {
    const c = this.calc();
    if (key === 'salary') return [
      ...c.tiers.map((t) => ({ label: `${t.degree} tier · ${t.headcount} agents · ${t.billableFte.toFixed(2)} billable FTE`, amount: t.salaryAmount })),
      { label: `New joiners · ${c.newJoining.units} · pro-rata`, amount: c.newJoining.amount },
      { label: `Resignations · ${c.resignation.units} · pro-rata + leave encashment`, amount: c.resignation.amount },
    ];
    if (key === 'overtime') return c.tiers.map((t) => ({ label: `${t.degree} tier · ${t.headcount} agents`, amount: t.overtime }));
    return [{ label: `${c.eligibleCalls.toLocaleString()} eligible calls (of ${c.sampleCalls.toLocaleString()}) × 0.05 OMR`, amount: c.incentive }];
  }

  async emailVendor(onlyKey?: string) {
    if (!this.ui.requires('Validate Invoice')) return;
    const mismatched = this.mismatched();
    if (!mismatched.length) return;
    const fmt = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const v = await this.ui.form({
      title: `Email ${this.vendor()}`,
      subtitle: `${this.store.period()} · the email lists each chosen line with their invoiced amount and our calculated amount, followed by your comment`,
      icon: 'mail',
      submitLabel: 'Send email',
      values: { to: this.vendorContact(), subject: `Invoice query — ${this.store.period()}`, lines: onlyKey ? [onlyKey] : mismatched.map((l) => l.key), comment: '' },
      fields: [
        { key: 'to', label: 'To', type: 'email', required: true },
        { key: 'subject', label: 'Subject', required: true },
        { key: 'lines', label: 'Lines that do not match', type: 'multiselect', options: mismatched.map((l) => ({ value: l.key, label: `${l.label} — invoiced ${fmt(this.vendorAmount(l.key))} · calculated ${fmt(l.calculated)}` })) },
        { key: 'comment', label: 'Comment', type: 'textarea', required: true, placeholder: 'e.g. Please re-issue the invoice with the calculated amounts, or send the supporting sheet for the difference.' },
      ],
    });
    if (!v) return;
    const keys: string[] = v['lines'] ?? [];
    const lines = mismatched.filter((l) => keys.includes(l.key)).map((l) => ({ key: l.key, label: l.label, calculated: l.calculated, vendorAmount: this.vendorAmount(l.key) }));
    if (!lines.length) { this.ui.toast('Pick at least one line to query.'); return; }
    this.store.queryVendor({ vendor: this.vendor(), period: this.store.period(), lines, to: v['to'], subject: v['subject'], comment: v['comment'] });
    this.ui.toast(`Email sent to ${v['to']}.`);
  }

  private allDetails(): InvoiceLineDetail[] {
    return this.lines()
      .map((l) => ({ key: l.key, label: l.label, calculated: l.calculated, vendorAmount: this.vendorAmount(l.key) }));
  }

  calculatedTotal = computed(() => this.allDetails().reduce((s, l) => s + l.calculated, 0));
  vendorTotal = computed(() => this.allDetails().reduce((s, l) => s + l.vendorAmount, 0));
  diff = computed(() => this.vendorTotal() - this.calculatedTotal());
  variance = computed(() => (this.calculatedTotal() ? (this.diff() / this.calculatedTotal()) * 100 : 0));
  withinTolerance = computed(() => Math.abs(this.variance()) <= this.store.payableRules().deviationPct);

  validate(keys: string[]) {
    if (!this.ui.requires('Validate Invoice')) return;
    const details = this.lines().filter((l) => keys.includes(l.key)).map((l) => ({ key: l.key, label: l.label, calculated: l.calculated, vendorAmount: this.vendorAmount(l.key) }));
    const runs = this.store.validateLines(this.vendor(), details);
    if (!runs.length) return;
    const flagged = runs.filter((r) => r.status === 'Flagged for review').map((r) => r.lines[0].label);
    const what = runs.length === 1 ? runs[0].lines[0].label : `${runs.length} lines`;
    this.ui.toast(flagged.length ? `${what} validated — ${flagged.join(', ')} flagged: more than ${this.store.payableRules().deviationPct}% off our calculation.` : `${what} validated — within tolerance.`, 5000);
  }

  async approve(keys: string[]) {
    if (!this.ui.requires('Validate Invoice')) return;
    const runs = keys.map((k) => this.store.lineRun(this.vendor(), k)!).filter((r) => r && (r.status === 'Validated' || r.status === 'Flagged for review'));
    if (!runs.length) return;
    const flagged = runs.filter((r) => r.status === 'Flagged for review').map((r) => r.lines[0].label);
    const names = runs.map((r) => r.lines[0].label).join(', ');
    const total = Math.round(runs.reduce((s, r) => s + r.vendorInvoiceAmount, 0)).toLocaleString();
    const ok = await this.ui.confirm({
      title: runs.length === 1 ? `Approve ${names} for payment?` : `Approve ${runs.length} lines for payment?`,
      message: `One payment of ${total} OMR for ${names} is created and tracked from Pending.` + (flagged.length ? ` ${flagged.join(', ')} ${flagged.length === 1 ? 'is' : 'are'} flagged — more than ${this.store.payableRules().deviationPct}% off our calculation.` : ''),
      confirmLabel: 'Approve', danger: flagged.length > 0, icon: 'payments',
    });
    if (!ok) return;
    const p = this.store.approveLines(this.vendor(), runs.map((r) => r.lines[0].key));
    this.ui.toast(`Approved — ${p?.id} added to PO & Payment Tracking.`);
  }

}
