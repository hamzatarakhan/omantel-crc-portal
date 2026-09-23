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
      <div class="flex items-start justify-between gap-3 flex-wrap px-4 py-3.5">
        <div>
          <h3 class="text-[13.5px] font-bold text-ink-900">Payable lines</h3>
          <p class="text-xs text-ink-400 mt-0.5">Enter what {{ vendor() }} invoiced for each line, then tick the lines to validate and pay now.</p>
        </div>
        <button mat-stroked-button (click)="emailVendor()" appRequires="Validate Invoice" [disabled]="!mismatched().length"><mat-icon class="!text-base !mr-1">mail</mat-icon>Email vendor{{ mismatched().length ? ' (' + mismatched().length + ')' : '' }}</button>
      </div>
      <div class="overflow-x-auto">
        <table class="crc-table w-full text-sm">
          <thead>
            <tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide">
              <th class="px-4 py-2 w-10"><input type="checkbox" class="w-4 h-4 accent-brand-600 align-middle" [checked]="allSelected()" (change)="allSelected() ? selectNone() : selectAll()" [disabled]="locked()" title="Select all lines" /></th>
              <th class="px-4 py-2 font-medium">Line</th>
              <th class="px-4 py-2 font-medium text-right">Calculated (OMR)</th>
              <th class="px-4 py-2 font-medium text-right">Vendor invoice (OMR)</th>
              <th class="px-4 py-2 font-medium text-right">Difference</th>
              <th class="px-4 py-2 font-medium">Status</th>
              <th class="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            @for (l of lines(); track l.key) {
              <tr class="border-t border-surface-border">
                <td class="px-4 py-2.5"><input type="checkbox" class="w-4 h-4 accent-brand-600 align-middle" [checked]="isSelected(l.key)" (change)="toggle(l.key)" [disabled]="locked()" /></td>
                <td class="px-4 py-2.5"><div class="font-semibold text-ink-900">{{ l.label }}</div>@if (l.note) { <div class="text-[11px] text-ink-400">{{ l.note }}</div> }</td>
                <td class="px-4 py-2.5 text-right font-medium text-ink-900">{{ l.calculated | number:'1.2-2' }}</td>
                <td class="px-4 py-2.5 text-right"><input type="number" step="0.01" class="w-32 text-right font-medium border border-surface-border rounded-lg px-2 py-1 focus:outline-none focus:border-brand-400 disabled:bg-surface-subtle disabled:text-ink-500" [ngModel]="vendorAmount(l.key)" (ngModelChange)="setVendorAmount(l.key, +$event)" [disabled]="locked()" /></td>
                <td class="px-4 py-2.5 text-right font-semibold whitespace-nowrap" [class]="lineState(l) === 'match' ? 'text-ink-400' : lineWithinTolerance(l) ? 'text-status-amber' : 'text-status-red'">{{ lineDiff(l) >= 0 ? '+' : '' }}{{ lineDiff(l) | number:'1.2-2' }}</td>
                <td class="px-4 py-2.5"><app-status-chip [label]="stateMeta[lineState(l)].label" [level]="stateMeta[lineState(l)].level"></app-status-chip></td>
                <td class="px-4 py-2.5 text-right whitespace-nowrap">
                  @if (lineState(l) !== 'match') { <button class="w-8 h-8 inline-flex items-center justify-center rounded-lg text-ink-400 hover:bg-surface-subtle hover:text-brand-700" (click)="emailVendor(l.key)" title="Email the vendor about this line"><mat-icon class="!text-lg">mail_outline</mat-icon></button> }
                  <button class="w-8 h-8 inline-flex items-center justify-center rounded-lg text-ink-400 hover:bg-surface-subtle hover:text-ink-700" (click)="toggleExpand(l.key)" [title]="isExpanded(l.key) ? 'Hide calculation' : 'Show calculation'"><mat-icon class="!text-lg">{{ isExpanded(l.key) ? 'expand_less' : 'expand_more' }}</mat-icon></button>
                </td>
              </tr>
              @if (isExpanded(l.key)) {
                <tr class="bg-surface-subtle">
                  <td></td>
                  <td colspan="6" class="px-4 pb-3 pt-1">
                    <div class="max-w-xl text-xs text-ink-500">
                      @for (b of breakdown(l.key); track b.label) {
                        <div class="flex justify-between gap-4 py-1.5 border-b border-surface-border last:border-0"><span>{{ b.label }}</span><span class="font-medium text-ink-800">{{ b.amount | number:'1.2-2' }}</span></div>
                      }
                      <p class="text-[11px] text-ink-400 mt-2">
                        @switch (l.key) {
                          @case ('salary') { Billing rate &times; billable-day ratio per agent, from the <a class="text-brand-600 font-medium" routerLink="/csr/leave">attendance sheet</a>. Absence is deducted; approved leave stays billable. }
                          @case ('overtime') { Each agent's overtime allowance from the monthly annexure, adjusted for billable days like salary. }
                          @case ('performance') { {{ calc().eligibleCalls | number }} eligible calls &times; 0.05 OMR. Calls shorter than {{ calc().threshold }}s don't count — <a class="text-brand-600 font-medium" routerLink="/invoicing/rules">change the rule</a>. }
                        }
                      </p>
                    </div>
                  </td>
                </tr>
              }
            }
          </tbody>
          <tfoot>
            <tr class="border-t-2 border-surface-border font-semibold">
              <td></td>
              <td class="px-4 py-2.5">Selected &middot; {{ selected().size }} of {{ lines().length }}</td>
              <td class="px-4 py-2.5 text-right">{{ calculatedTotal() | number:'1.2-2' }}</td>
              <td class="px-4 py-2.5 text-right">{{ vendorTotal() | number:'1.2-2' }}</td>
              <td class="px-4 py-2.5 text-right whitespace-nowrap" [class]="withinTolerance() ? 'text-status-normal' : 'text-status-red'">{{ diff() >= 0 ? '+' : '' }}{{ diff() | number:'1.2-2' }} <span class="text-xs font-medium">({{ variance() >= 0 ? '+' : '' }}{{ variance() | number:'1.1-1' }}%)</span></td>
              <td colspan="2"></td>
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

    <div class="surface-card p-4 mb-4">
      <div class="flex items-center gap-2 flex-wrap">
        <button mat-flat-button color="primary" (click)="validate()" appRequires="Validate Invoice" [disabled]="locked() || !selected().size"><mat-icon class="!text-base !mr-1">fact_check</mat-icon>Validate selected lines</button>
        @if (runMatchesSelection() && (run()?.status === 'Validated' || run()?.status === 'Flagged for review')) {
          <button mat-flat-button color="primary" (click)="approve()" appRequires="Validate Invoice"><mat-icon class="!text-base !mr-1">payments</mat-icon>Approve for payment</button>
        }
        @if (runMatchesSelection() && run()?.status === 'Approved for payment') {
          <a mat-stroked-button routerLink="/invoicing/tracking"><mat-icon class="!text-base !mr-1">view_kanban</mat-icon>Open in PO & Payment Tracking</a>
        }
      </div>
      @if (runMatchesSelection() && run(); as r) {
        <p class="text-xs mt-3" [class]="r.status === 'Flagged for review' ? 'text-status-red font-medium' : 'text-status-normal font-medium'">
          {{ r.status }} ({{ r.lines.length }} line{{ r.lines.length === 1 ? '' : 's' }}) — vendor invoice {{ r.vendorInvoiceAmount | number:'1.2-2' }} vs calculated {{ r.calculatedTotal | number:'1.2-2' }} OMR ({{ r.variancePct >= 0 ? '+' : '' }}{{ r.variancePct | number:'1.2-2' }}%).
        </p>
      } @else if (!selected().size) {
        <p class="text-xs text-ink-400 mt-3">Select at least one line above to validate and pay it.</p>
      }
      @if (pastRuns().length) {
        <div class="text-xs text-ink-400 mt-3 pt-3 border-t border-surface-border">
          <div class="font-semibold text-ink-500 mb-1">Earlier this period</div>
          @for (r of pastRuns(); track $index) {
            <div>{{ r.lines.length }} line{{ r.lines.length === 1 ? '' : 's' }} ({{ r.lines[0].label }}{{ r.lines.length > 1 ? ' + ' + (r.lines.length - 1) + ' more' : '' }}) — {{ r.status }}, {{ r.vendorInvoiceAmount | number:'1.2-2' }} OMR</div>
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
  allSelected = computed(() => this.lines().every((l) => this.selected().has(l.key)));
  mismatched = computed(() => this.lines().filter((l) => this.lineState(l) !== 'match'));
  queries = computed(() => this.store.vendorQueries().filter((q) => q.vendor === this.vendor() && q.period === this.store.period()));

  runs = computed(() => this.store.invoiceRuns()[this.vendor()] ?? []);
  run = computed(() => this.runs()[this.runs().length - 1]);
  pastRuns = computed(() => this.runs().slice(0, -1));
  runMatchesSelection = computed(() => {
    const r = this.run();
    if (!r) return false;
    const a = r.lines.map((l) => l.key).sort().join(',');
    const b = [...this.selected()].sort().join(',');
    return a === b;
  });
  status = computed(() => (this.runMatchesSelection() ? this.run()?.status ?? 'Not started' : 'Not started'));
  statusLevel = computed<StatusLevel>(() => ({ 'Not started': 'neutral', Validated: 'normal', 'Flagged for review': 'red', 'Approved for payment': 'info' } as Record<string, StatusLevel>)[this.status()]);
  locked = computed(() => this.runMatchesSelection() && this.run()?.status === 'Approved for payment');

  isSelected(key: string) {
    return this.selected().has(key);
  }

  toggle(key: string) {
    if (this.locked()) return;
    const next = new Set(this.selected());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.selectedByVendor.update((m) => ({ ...m, [this.vendor()]: next }));
  }

  pickVendor(v: string) {
    this.vendor.set(v);
  }

  selectAll() {
    if (this.locked()) return;
    this.selectedByVendor.update((m) => ({ ...m, [this.vendor()]: new Set(this.lines().map((l) => l.key)) }));
  }

  selectNone() {
    if (this.locked()) return;
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

  private selectedDetails(): InvoiceLineDetail[] {
    return this.lines()
      .filter((l) => this.isSelected(l.key))
      .map((l) => ({ key: l.key, label: l.label, calculated: l.calculated, vendorAmount: this.vendorAmount(l.key) }));
  }

  calculatedTotal = computed(() => this.selectedDetails().reduce((s, l) => s + l.calculated, 0));
  vendorTotal = computed(() => this.selectedDetails().reduce((s, l) => s + l.vendorAmount, 0));
  diff = computed(() => this.vendorTotal() - this.calculatedTotal());
  variance = computed(() => (this.calculatedTotal() ? (this.diff() / this.calculatedTotal()) * 100 : 0));
  withinTolerance = computed(() => Math.abs(this.variance()) <= this.store.payableRules().deviationPct);

  validate() {
    if (!this.ui.requires('Validate Invoice')) return;
    const details = this.selectedDetails();
    if (!details.length) return;
    const run = this.store.validateInvoice(this.vendor(), details);
    this.ui.toast(run.status === 'Validated' ? 'Selected lines validated — within tolerance.' : `Flagged: ${run.variancePct.toFixed(2)}% deviation exceeds the ${this.store.payableRules().deviationPct}% limit.`, 5000);
  }

  async approve() {
    if (!this.ui.requires('Validate Invoice')) return;
    const r = this.run();
    if (!r) return;
    const flagged = r.status === 'Flagged for review';
    const names = r.lines.map((l) => l.label).join(', ');
    const ok = await this.ui.confirm({
      title: flagged ? 'Approve a flagged invoice?' : 'Approve for payment?',
      message: flagged
        ? `${names} deviates ${r.variancePct.toFixed(2)}% from the calculation. Approving creates a payment of ${Math.round(r.vendorInvoiceAmount).toLocaleString()} OMR anyway.`
        : `A payment of ${Math.round(r.vendorInvoiceAmount).toLocaleString()} OMR for ${names} is created and tracked from Pending.`,
      confirmLabel: 'Approve', danger: flagged, icon: 'payments',
    });
    if (!ok) return;
    const p = this.store.approveInvoice(this.vendor());
    this.ui.toast(`Approved — ${p?.id} added to PO & Payment Tracking.`);
  }
}
