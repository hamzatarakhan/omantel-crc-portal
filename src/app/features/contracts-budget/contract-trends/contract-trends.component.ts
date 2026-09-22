import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ChartConfiguration, ChartType } from 'chart.js';
import { Contract } from '../../../core/models/domain';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ChartCardComponent } from '../../../shared/components/chart-card/chart-card.component';
import { ContractOps } from '../../../core/services/contract-ops.service';
import { addDays } from '../../../core/services/contract-data';
import { requiredActionFor, needsAction } from '../../../core/services/contract-monitoring';

const FIELD = 'w-full px-2.5 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 focus:outline-none focus:border-brand-400';
const C = { brand: '#2d13ea', orange: '#ea6e00', teal: '#0f9c8f', green: '#0e9f6e', amber: '#e3a008', red: '#e02424', grey: '#8589a3' };
const PALETTE = [C.brand, C.orange, C.teal, C.green, C.amber, C.grey];
const monthStart = (offset: number) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + offset, 1); };
const monthLabel = (d: Date) => d.toLocaleString('en-GB', { month: 'short', year: '2-digit' });
const sameMonth = (iso: string, m: Date) => { const d = new Date(iso); return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth(); };
const quarter = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()} Q${Math.floor(d.getMonth() / 3) + 1}`; };

interface ChartDef { title: string; subtitle: string; type: ChartType; data: ChartConfiguration['data']; options?: ChartConfiguration['options'] }

@Component({
  selector: 'app-contract-trends',
  standalone: true,
  imports: [CommonModule, MatIconModule, PageHeaderComponent, ChartCardComponent],
  template: `
    <app-page-header
      title="Contract Trends"
      subtitle="Portfolio and contract-level trend charts, all computed from the synchronized ERP data"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Contract Trends' }]"
    ></app-page-header>

    <div class="surface-card px-4 py-3.5 mb-4">
      <div class="flex items-center gap-2"><mat-icon class="!text-lg text-ink-400">filter_alt</mat-icon><span class="text-xs font-bold text-ink-500 uppercase tracking-wide">Filter every chart</span><span class="text-xs text-ink-400">{{ contracts().length }} contract{{ contracts().length === 1 ? '' : 's' }} selected</span><button (click)="clear()" class="ml-auto text-xs font-semibold text-brand-700 hover:underline">Clear filters</button></div>
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-9 gap-2.5 mt-2.5">
        @for (f of selects(); track f.key) {
          <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">{{ f.label }}</span>
            <select [class]="field + ' mt-1'" [value]="f.value()" (change)="f.set($any($event.target).value)">
              @for (o of f.options; track o) { <option [value]="o" [selected]="o === f.value()">{{ o === 'All' ? f.all : o }}</option> }
            </select>
          </label>
        }
        <div class="col-span-2 grid grid-cols-2 gap-2.5 md:contents">
        <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Ends from</span><input type="date" [class]="field + ' mt-1'" [value]="from()" (change)="from.set($any($event.target).value)" /></label>
        <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Ends to</span><input type="date" [class]="field + ' mt-1'" [value]="to()" (change)="to.set($any($event.target).value)" /></label>
        </div>
        <div class="col-span-2 grid grid-cols-2 gap-2.5 md:contents">
        <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Amount min (OMR)</span><input type="number" min="0" [class]="field + ' mt-1'" [value]="min()" (input)="min.set($any($event.target).value)" placeholder="0" /></label>
        <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Amount max (OMR)</span><input type="number" min="0" [class]="field + ' mt-1'" [value]="max()" (input)="max.set($any($event.target).value)" placeholder="Any" /></label>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      @for (c of charts(); track c.title) {
        <div class="h-[330px]"><app-chart-card [title]="c.title" [subtitle]="c.subtitle" [type]="c.type" [data]="c.data" [options]="c.options ?? defaultOptions"></app-chart-card></div>
      }
    </div>
  `,
})
export class ContractTrendsComponent {
  private ops = inject(ContractOps);
  field = FIELD;

  vendor = signal('All');
  type = signal('All');
  parent = signal('All');
  status = signal('All');
  category = signal('All');
  from = signal('');
  to = signal('');
  min = signal('');
  max = signal('');

  defaultOptions: ChartConfiguration['options'] = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } };
  private money: ChartConfiguration['options'] = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } }, scales: { y: { beginAtZero: true } } };
  private stacked: ChartConfiguration['options'] = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } };
  private horizontal: ChartConfiguration['options'] = { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } };

  private base = computed(() => this.ops.active());
  selects = computed(() => [
    { key: 'vendor', label: 'Vendor', all: 'All vendors', value: this.vendor, set: (v: string) => this.vendor.set(v), options: ['All', ...new Set(this.base().map((c) => c.vendorName))].sort() },
    { key: 'type', label: 'Contract type', all: 'All types', value: this.type, set: (v: string) => this.type.set(v), options: ['All', ...new Set(this.base().map((c) => c.contractType))].sort() },
    { key: 'parent', label: 'Contract', all: 'All contracts', value: this.parent, set: (v: string) => this.parent.set(v), options: ['All', ...this.base().map((c) => c.reference)] },
    { key: 'status', label: 'Status', all: 'All statuses', value: this.status, set: (v: string) => this.status.set(v), options: ['All', 'Active', 'Expiring Soon', 'Expired'] },
    { key: 'category', label: 'Record type', all: 'All records', value: this.category, set: (v: string) => this.category.set(v), options: ['All', 'Variation Order', 'Amendment', 'Time Extension'] },
  ]);

  contracts = computed(() => {
    const min = this.min() === '' ? null : Number(this.min());
    const max = this.max() === '' ? null : Number(this.max());
    return this.base().filter((c) =>
      (this.vendor() === 'All' || c.vendorName === this.vendor()) && (this.type() === 'All' || c.contractType === this.type()) && (this.parent() === 'All' || c.reference === this.parent()) &&
      (this.status() === 'All' || c.status === this.status()) && (!this.from() || c.endDate >= this.from()) && (!this.to() || c.endDate <= this.to()) &&
      (min === null || c.amount >= min) && (max === null || c.amount <= max));
  });

  private kids = (c: Contract) => this.ops.childrenOf(c).filter((k) => this.category() === 'All' || k.recordType === this.category());

  charts = computed<ChartDef[]>(() => {
    const cs = this.contracts();
    const now = new Date().toISOString().slice(0, 10);
    const months12 = Array.from({ length: 12 }, (_, i) => monthStart(i));
    const past12 = Array.from({ length: 12 }, (_, i) => monthStart(i - 11));
    const mixed = Array.from({ length: 12 }, (_, i) => monthStart(i - 5));
    const byVendor = [...new Set(cs.map((c) => c.vendorName))];
    const byType = [...new Set(cs.map((c) => c.contractType))];
    const sum = (list: number[]) => list.reduce((s, x) => s + x, 0);
    const allKids = cs.flatMap((c) => this.kids(c));

    // active / expiring / expired at the end of each month
    const state = (m: Date) => {
      const end = new Date(m.getFullYear(), m.getMonth() + 1, 0).toISOString().slice(0, 10);
      const soon = addDays(end, 30);
      return {
        active: cs.filter((c) => c.startDate <= end && c.endDate > soon).length,
        expiring: cs.filter((c) => c.startDate <= end && c.endDate >= end && c.endDate <= soon).length,
        expired: cs.filter((c) => c.startDate <= end && c.endDate < end).length,
      };
    };

    // renewed / extended by quarter
    const quarters = [...new Set(Array.from({ length: 8 }, (_, i) => quarter(monthStart(i * 3 - 15).toISOString())))];
    const renewedEvents = this.ops.changes().filter((x) => x.field === 'Renewal status' && x.next === 'Renewed' && cs.some((c) => c.id === x.contractId)).map((x) => quarter(x.at));
    const extended = cs.flatMap((c) => this.ops.childrenOf(c)).filter((k) => k.recordType === 'Time Extension').map((k) => quarter(k.issuedDate));

    // escalations by month
    const escalationDates = cs.flatMap((c) => this.ops.escalationHistory(c).filter((e) => e.status === 'Escalated').map((e) => e.at));

    // requiring action, grouped by what has to be done
    const actions = new Map<string, number>();
    for (const c of cs.filter((x) => needsAction(x))) actions.set(requiredActionFor(c), (actions.get(requiredActionFor(c)) ?? 0) + 1);

    const bucket = (v: string) => cs.filter((c) => c.vendorName === v);
    return [
      { title: 'Contracts Expiring by Month', subtitle: 'Next 12 months', type: 'bar' as const, data: { labels: months12.map(monthLabel), datasets: [{ label: 'Contracts expiring', data: months12.map((m) => cs.filter((c) => sameMonth(c.endDate, m)).length), backgroundColor: C.brand }] } },
      { title: 'Active, Expiring and Expired over Time', subtitle: 'Count at the end of each month (expiring = ends within 30 days)', type: 'line' as const, data: { labels: mixed.map(monthLabel), datasets: [
        { label: 'Active', data: mixed.map((m) => state(m).active), borderColor: C.green, backgroundColor: C.green, tension: 0.3 },
        { label: 'Expiring', data: mixed.map((m) => state(m).expiring), borderColor: C.amber, backgroundColor: C.amber, tension: 0.3 },
        { label: 'Expired', data: mixed.map((m) => state(m).expired), borderColor: C.red, backgroundColor: C.red, tension: 0.3 },
      ] } },
      { title: 'Contract Value by Vendor', subtitle: 'OMR', type: 'bar' as const, options: this.horizontal, data: { labels: byVendor, datasets: [{ label: 'Contract value (OMR)', data: byVendor.map((v) => sum(bucket(v).map((c) => c.amount))), backgroundColor: PALETTE }] } },
      { title: 'Contract Value by Contract Type', subtitle: 'OMR', type: 'doughnut' as const, options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'right' as const, labels: { boxWidth: 10, font: { size: 11 } } } } }, data: { labels: byType, datasets: [{ data: byType.map((t) => sum(cs.filter((c) => c.contractType === t).map((c) => c.amount))), backgroundColor: PALETTE, borderWidth: 0 }] } },
      { title: 'PO Value and Contract Amount by Contract', subtitle: 'OMR — PO value is the contract amount plus amendments', type: 'bar' as const, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' as const, labels: { boxWidth: 10, font: { size: 11 } } } }, scales: { y: { beginAtZero: true } } }, data: { labels: cs.map((c) => c.reference.slice(-8)), datasets: [{ label: 'Contract amount', data: cs.map((c) => c.amount), backgroundColor: C.brand }, { label: 'PO value', data: cs.map((c) => this.ops.purchaseOrdersOf(c).reduce((s, p) => s + (p.amount ?? 0), 0)), backgroundColor: C.orange }] } },
      { title: 'Variation Orders per Contract', subtitle: 'Scope-of-work lines under each contract\'s PO', type: 'bar' as const, options: this.horizontal, data: { labels: cs.map((c) => c.reference.slice(-8)), datasets: [{ label: 'Variation Order lines', data: cs.map((c) => this.kids(c).filter((k) => k.recordType === 'Variation Order').length), backgroundColor: C.teal }] } },
      { title: 'Amendments and Time Extensions over Time', subtitle: 'Issued per month, last 12 months', type: 'bar' as const, data: { labels: past12.map(monthLabel), datasets: [
        { label: 'Amendments', data: past12.map((m) => allKids.filter((k) => k.recordType === 'Amendment' && sameMonth(k.issuedDate, m)).length), backgroundColor: C.orange },
        { label: 'Time extensions', data: past12.map((m) => allKids.filter((k) => k.recordType === 'Time Extension' && sameMonth(k.issuedDate, m)).length), backgroundColor: C.brand },
      ] } },
      { title: 'Renewed and Extended Contracts by Quarter', subtitle: 'Renewals recorded from the ERP and time extensions issued', type: 'bar' as const, data: { labels: quarters, datasets: [
        { label: 'Renewed', data: quarters.map((q) => renewedEvents.filter((x) => x === q).length), backgroundColor: C.green },
        { label: 'Extended', data: quarters.map((q) => extended.filter((x) => x === q).length), backgroundColor: C.brand },
      ] } },
      { title: 'Expiry Distribution by Vendor', subtitle: 'Contracts per vendor by time left', type: 'bar' as const, options: this.stacked, data: { labels: byVendor, datasets: [
        { label: 'Expired', data: byVendor.map((v) => bucket(v).filter((c) => c.endDate < now).length), backgroundColor: C.red },
        { label: '30 days or less', data: byVendor.map((v) => bucket(v).filter((c) => c.endDate >= now && c.endDate <= addDays(now, 30)).length), backgroundColor: C.amber },
        { label: '31–90 days', data: byVendor.map((v) => bucket(v).filter((c) => c.endDate > addDays(now, 30) && c.endDate <= addDays(now, 90)).length), backgroundColor: C.teal },
        { label: 'More than 90 days', data: byVendor.map((v) => bucket(v).filter((c) => c.endDate > addDays(now, 90)).length), backgroundColor: C.green },
      ] } },
      { title: 'Contracts Requiring Action', subtitle: 'By the next step needed', type: 'bar' as const, options: this.horizontal, data: { labels: [...actions.keys()], datasets: [{ label: 'Contracts', data: [...actions.values()], backgroundColor: C.orange }] } },
      { title: 'Escalated Contracts over Time', subtitle: 'Escalations per month', type: 'line' as const, data: { labels: mixed.map(monthLabel), datasets: [{ label: 'Escalations', data: mixed.map((m) => escalationDates.filter((d) => sameMonth(d, m)).length), borderColor: C.red, backgroundColor: C.red, tension: 0.3 }] } },
    ];
  });

  clear() {
    for (const s of [this.vendor, this.type, this.parent, this.status, this.category]) s.set('All');
    for (const s of [this.from, this.to, this.min, this.max]) s.set('');
  }
}
