import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { Agent } from '../../../core/models/domain';
import { CODE_STYLE } from '../agent-profile/agent-profile.component';

const LEAVE_LEGEND: Array<{ code: string; meaning: string; notes?: string }> = [
  { code: 'P', meaning: 'Presence' },
  { code: 'OFF', meaning: 'Off day' },
  { code: 'A', meaning: 'Absence' },
  { code: 'S/L', meaning: 'Sick Leave' },
  { code: 'M/L', meaning: 'Maternity Leave', notes: '98 days' },
  { code: 'P/L', meaning: 'Paternity Leave', notes: '7 days' },
  { code: 'C/L', meaning: 'Annual / Exception Leave' },
  { code: 'SP', meaning: 'Compassionate / Family Leave', notes: 'Bereavement, marriage' },
  { code: 'ST/L', meaning: 'Study Leave', notes: '15 days' },
  { code: 'AS', meaning: 'Accompanying Sick Family Member', notes: '15 days' },
];
import { RequiresDirective } from '../../../shared/directives/requires.directive';

@Component({
  selector: 'app-leave-management',
  standalone: true,
  imports: [RequiresDirective, CommonModule, FormsModule, MatTabsModule, MatButtonModule, MatIconModule, PageHeaderComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Leave Management"
      subtitle="Leave data synced from the Workforce (WFO) system &middot; reclassify type or add a note without altering the source"
      [breadcrumbs]="[{ label: 'CSR Management', link: '/csr/directory' }, { label: 'Leave Management' }]"
    >
      <select class="h-9 pl-3 pr-8 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 focus:outline-none focus:border-brand-400" (change)="month.set($any($event.target).value)" title="Month">
        @for (m of months; track m) { <option [value]="m" [selected]="m === month()">{{ monthLabel(m) }}</option> }
      </select>
      <div class="flex items-center gap-1.5">
        <input type="date" [ngModel]="fromDate()" (ngModelChange)="fromDate.set($event)" title="From date" class="h-9 px-2.5 text-xs rounded-lg border border-surface-border bg-white focus:outline-none focus:border-brand-400" />
        <span class="text-xs text-ink-400">&rarr;</span>
        <input type="date" [ngModel]="toDate()" (ngModelChange)="toDate.set($event)" title="To date" class="h-9 px-2.5 text-xs rounded-lg border border-surface-border bg-white focus:outline-none focus:border-brand-400" />
        @if (rangeActive()) {
          <button class="h-9 w-9 rounded-lg flex items-center justify-center text-ink-400 hover:bg-surface-subtle" title="Clear date range" (click)="fromDate.set(''); toDate.set('')"><mat-icon class="!text-lg">close</mat-icon></button>
        }
      </div>
      <button mat-stroked-button (click)="exportSheet()"><mat-icon class="!text-base !mr-1">download</mat-icon>Export sheet</button>
      <button mat-flat-button color="primary" (click)="override()" appRequires="Manage Leave & Attendance"><mat-icon class="!text-base !mr-1">edit_calendar</mat-icon>Record leave override</button>
    </app-page-header>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      @for (c of cards(); track c.label) {
        <div class="surface-card px-4 py-3"><div class="text-[11px] font-bold text-ink-400 uppercase tracking-wide">{{ c.label }}</div><div class="text-lg font-extrabold" [class]="c.tone">{{ c.value }}</div></div>
      }
    </div>

    <mat-tab-group>
      <mat-tab [label]="rangeActive() ? 'Leave ' + fromDate() + ' → ' + toDate() : isCurrent() ? 'On leave today' : 'Leave in ' + monthLabel(month())">
        <div class="pt-4">
          @if (rangeActive()) {
            <app-data-table [title]="'Agents with leave from ' + fromDate() + ' to ' + toDate()" [columns]="monthColumns" [rows]="monthLeave()" emptyTitle="No leave in this range" emptyDescription="Every agent was present, off or absent across these dates."></app-data-table>
            <p class="text-xs text-ink-400 mt-3">A date range is read-only, same as a past month.</p>
          } @else if (isCurrent()) {
            <app-data-table title="Agents on leave" [columns]="columns" [rows]="onLeave()" (rowClick)="reclassify($event)" emptyTitle="No one is on leave today" emptyDescription="All agents are scheduled as present or off."></app-data-table>
            <p class="text-xs text-ink-400 mt-3">Click a row to reclassify the leave type or return the agent to present.</p>
          } @else {
            <app-data-table [title]="'Agents with leave in ' + monthLabel(month())" [columns]="monthColumns" [rows]="monthLeave()" emptyTitle="No leave that month" emptyDescription="Every agent was present, off or absent."></app-data-table>
            <p class="text-xs text-ink-400 mt-3">A past month is read-only. Its day-by-day codes are on the attendance sheet tab.</p>
          }
        </div>
      </mat-tab>

      <mat-tab [label]="'Attendance sheet · ' + (rangeActive() ? fromDate() + ' → ' + toDate() : monthLabel(month()))">
        <div class="pt-4">
          <div class="surface-card p-4 mb-4">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-ink-500 mb-3">Leave Code Legend</h3>
            <div class="flex flex-wrap gap-2">
              @for (l of legend; track l.code) {
                <span class="text-xs rounded-full px-3 py-1" [class]="style(l.code)">
                  <span class="font-semibold">{{ l.code }}</span> &mdash; {{ l.meaning }}
                </span>
              }
            </div>
          </div>

          <div class="surface-card overflow-hidden">
            <h3 class="px-4 pt-3.5 text-[13.5px] font-bold text-ink-900">Attendance sheet</h3>
            <div class="flex items-center justify-between gap-3 p-3.5 border-b border-surface-border flex-wrap">
              <div class="flex items-center gap-3 flex-1 min-w-0">
                <div class="relative w-full max-w-[260px]">
                  <mat-icon class="!text-ink-400 !text-lg absolute left-2.5 top-1/2 -translate-y-1/2">search</mat-icon>
                  <input [ngModel]="q()" (ngModelChange)="q.set($event)" placeholder="Search..." class="pl-9 pr-3 py-2 text-sm rounded-lg border border-surface-border w-full focus:outline-none focus:border-brand-400 transition-colors placeholder:text-ink-400" />
                </div>
                <span class="text-xs font-semibold text-ink-400 bg-surface-subtle rounded-full px-2.5 py-1 whitespace-nowrap hidden xs:inline-block">{{ sheet().length }} of {{ agents().length }}</span>
              </div>
              <div class="relative">
                <select [ngModel]="vendor()" (ngModelChange)="vendor.set($event)" class="pl-3 pr-8 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 appearance-none focus:outline-none focus:border-brand-400">
                  <option value="All">All vendors</option>
                  <option>Infoline</option><option>Green Umbrella</option><option>OJT</option>
                </select>
                <mat-icon class="!text-base !text-ink-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">expand_more</mat-icon>
              </div>
            </div>

            <div class="overflow-auto max-h-[560px]">
              <table class="crc-table w-full min-w-[980px]">
                <thead>
                  <tr class="text-left">
                    <th class="sticky left-0 top-0 z-20 min-w-[220px] border-b border-surface-border">Agent</th>
                    @for (d of effectiveDays(); track d) { <th class="sticky top-0 z-10 !px-1 text-center border-b border-surface-border">{{ rangeActive() ? d.slice(5) : d.slice(8) }}</th> }
                  </tr>
                </thead>
                <tbody>
                  @for (a of sheet(); track a.id) {
                    <tr>
                      <td class="sticky left-0 z-10 bg-white"><div class="font-semibold text-ink-900 text-[13px] truncate max-w-[200px]">{{ a.name }}</div><div class="text-[11px] text-ink-400 mt-0.5">{{ a.queue }}</div></td>
                      @for (d of effectiveDays(); track d) {
                        <td class="!px-1 !py-2 text-center">
                          @if (store.attendanceOn(a, d); as code) {
                            <span class="block w-full max-w-[46px] mx-auto rounded-lg py-1.5 text-[11px] font-bold" [class]="style(code)">{{ code }}</span>
                          } @else { <span class="text-ink-300 text-[11px]">&middot;</span> }
                        </td>
                      }
                    </tr>
                  } @empty {
                    <tr><td [attr.colspan]="effectiveDays().length + 1" class="text-center text-ink-400 !py-10">No agents match your filter.</td></tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="p-3.5 border-t border-surface-border text-xs text-ink-400">The attendance sheet is read-only, synced from WFO as-is. To change a day's code, use “Record leave override” — the source WFO record is not altered, and the override is kept and audited. Billable days used by the Reconciliation Workspace come from the live (last 14) days.</div>
          </div>
        </div>
      </mat-tab>

      <mat-tab [label]="'Changes from previous month (' + changeRows().length + ')'">
        <div class="pt-4">
          <div class="flex items-center justify-between gap-3 flex-wrap mb-3 surface-card px-4 py-3">
            <div class="text-xs text-ink-500"><mat-icon class="!text-base !w-4 !h-4 align-middle text-brand-600">sync</mat-icon> Last WFO sync: <b class="text-ink-800">{{ store.wfoSync() ? (store.wfoSync()!.at | date:'d MMM y, HH:mm') : 'not yet' }}</b>@if (store.wfoSync()) { &middot; {{ store.wfoSync()!.changes }} change(s) found } &middot; the WFO is synced daily and last month's records are compared each time</div>
            @if (store.can('Manage Leave & Attendance')) { <button mat-stroked-button (click)="syncNow()"><mat-icon class="!text-base !mr-1">sync</mat-icon>Sync now</button> }
          </div>
          <app-data-table title="Previous-month attendance changes" [columns]="changeColumns" [rows]="changeRows()" (rowAction)="onChangeAction($event)" emptyTitle="No changes" emptyDescription="When a record from the previous month is changed after it was reported — for example Absent to Sick Leave — the pay effect appears here and waits as an Addition or Deduction for the vendor's next Salary claim."></app-data-table>
          <p class="text-xs text-ink-400 mt-3">Each change keeps the original record, the updated record and the resulting adjustment. The agent is notified by SMS and email, in Arabic and English. Changes arrive from the WFO sync, not from manual entry.</p>
        </div>
      </mat-tab>
    </mat-tab-group>
  `,
})
export class LeaveManagementComponent {
  store = inject(CrcStore);
  private ui = inject(UiService);
  private router = inject(Router);

  /** A vendor sees only their own company's agents; everyone else sees all of them. */
  agents = computed(() => {
    const own = this.store.ownVendor();
    if (!own) return this.store.agents();
    const short = own.startsWith('Green') ? 'Green Umbrella' : own.startsWith('Infoline') ? 'Infoline' : 'OJT';
    return this.store.agents().filter((a) => a.vendor === short);
  });
  legend = LEAVE_LEGEND;
  q = signal('');
  vendor = signal('All');
  readonly months = [...this.store.payrollMonths()].reverse();
  month = signal(this.months[0]);
  isCurrent = computed(() => this.month() === this.months[0]);
  fromDate = signal('');
  toDate = signal('');
  /** Both ends of the range picked and in order — overrides the month filter when set. */
  rangeActive = computed(() => !!this.fromDate() && !!this.toDate() && this.fromDate() <= this.toDate());
  /** Every day of the selected month, 'YYYY-MM-DD'. */
  monthDays = computed(() => {
    const [y, m] = this.month().split('-').map(Number);
    return Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => `${this.month()}-${String(i + 1).padStart(2, '0')}`);
  });
  /** Every day between fromDate and toDate inclusive, 'YYYY-MM-DD' — can span a month boundary. */
  rangeDays = computed(() => {
    if (!this.rangeActive()) return [];
    const days: string[] = [];
    for (let d = new Date(this.fromDate()); d <= new Date(this.toDate()); d.setDate(d.getDate() + 1)) days.push(d.toISOString().slice(0, 10));
    return days;
  });
  /** The day list every leave computation reads — the picked range when set, otherwise the selected month. */
  effectiveDays = computed(() => (this.rangeActive() ? this.rangeDays() : this.monthDays()));
  private codeMeaning = Object.fromEntries(LEAVE_LEGEND.map((l) => [l.code, l.meaning]));

  /** Today's counts in the current month; day totals across the month for a past one. */
  cards = computed(() => {
    if (this.isCurrent() && !this.rangeActive()) {
      const t = this.today();
      return [
        { label: 'Present today', value: t['Present'], tone: 'text-status-normal' }, { label: 'On leave', value: t['On Leave'], tone: 'text-status-amber' },
        { label: 'Off day', value: t['Off'], tone: 'text-ink-700' }, { label: 'Absent', value: t['Absent'], tone: 'text-status-red' },
      ];
    }
    const n = { P: 0, leave: 0, OFF: 0, A: 0 };
    for (const a of this.agents()) for (const d of this.effectiveDays()) {
      const c = this.store.attendanceOn(a, d);
      if (c === 'P' || c === 'OFF' || c === 'A') n[c]++; else if (c) n.leave++;
    }
    return [
      { label: 'Present days', value: n.P, tone: 'text-status-normal' }, { label: 'Leave days', value: n.leave, tone: 'text-status-amber' },
      { label: 'Off days', value: n.OFF, tone: 'text-ink-700' }, { label: 'Absent days', value: n.A, tone: 'text-status-red' },
    ];
  });

  /** Agents with leave in a past month: their main leave type and how many days. */
  monthLeave = computed(() => this.agents().map((a) => {
    const counts: Record<string, number> = {};
    for (const d of this.effectiveDays()) { const c = this.store.attendanceOn(a, d); if (c && c !== 'P' && c !== 'OFF' && c !== 'A') counts[c] = (counts[c] ?? 0) + 1; }
    const codes = Object.keys(counts).sort((x, y) => counts[y] - counts[x]);
    return { ...a, leaveType: codes.map((c) => this.codeMeaning[c] ?? c).join(', '), leaveDays: codes.reduce((s, c) => s + counts[c], 0) };
  }).filter((r) => r.leaveDays > 0));

  changeRows = computed(() => this.store.attendanceChanges().filter((c) => this.agents().some((a) => a.id === c.agentId)).map((c) => ({ ...c, change: c.original + ' → ' + c.updated, adjustment: (c.type === 'Addition' ? '+' : '−') + c.amount.toFixed(3) + ' OMR' })));
  changeColumns: TableColumn<any>[] = [
    { key: 'agentName', label: 'Agent' },
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'date', label: 'Day', type: 'date' },
    { key: 'change', label: 'Original → updated' },
    { key: 'adjustment', label: 'Adjustment', align: 'right', cellClass: (r) => (r.type === 'Addition' ? 'text-status-normal font-semibold' : 'text-status-red font-semibold') },
    { key: 'status', label: 'Status', type: 'status', statusFn: (r) => ({ label: r.status, level: r.status === 'Pending' ? 'amber' : 'info' }) },
    { key: 'action', label: '', actions: [{ id: 'msg', label: 'Notification', icon: 'sms' }] },
  ];

  syncNow() {
    const n = this.store.syncWfo();
    this.ui.toast(n ? `WFO synced — ${n} change(s) affecting salary found.` : 'WFO synced — no new changes in last month\'s records.');
  }

  onChangeAction(e: { row: any; id: string }) {
    const r = e.row;
    this.ui.confirm({ title: 'Notification sent to ' + r.agentName, message: (r.notifications as Array<{ channel: string; to: string; text: string }>).map((m) => m.channel + ' to ' + m.to + '\n' + m.text).join('\n\n'), confirmLabel: 'Close', icon: 'sms' });
  }

  monthColumns: TableColumn<any>[] = [
    { key: 'name', label: 'Agent' },
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'queue', label: 'Queue' },
    { key: 'leaveType', label: 'Leave Type', type: 'status', statusFn: (r) => ({ label: r.leaveType, level: 'amber' }) },
    { key: 'leaveDays', label: 'Leave days', type: 'number', align: 'right' },
  ];

  monthLabel(m: string) {
    const [y, mo] = m.split('-').map(Number);
    return new Date(y, mo - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  }

  onLeave = computed(() => this.agents().filter((a) => a.status === 'On Leave'));
  today = computed(() => {
    const c: Record<string, number> = { Present: 0, 'On Leave': 0, Off: 0, Absent: 0 };
    for (const a of this.agents()) c[a.status]++;
    return c;
  });
  /** Every agent matching the filters — what the Excel timesheet exports. */
  private matching = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.agents().filter((a) => (this.vendor() === 'All' || a.vendor === this.vendor()) && (!q || a.name.toLowerCase().includes(q) || a.queue.toLowerCase().includes(q)));
  });
  /** The screen shows the first 60 only. */
  sheet = computed(() => this.matching().slice(0, 60));

  columns: TableColumn<Agent>[] = [
    { key: 'name', label: 'Agent' },
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'queue', label: 'Queue' },
    { key: 'leaveType', label: 'Leave Type', type: 'status', statusFn: (r) => ({ label: r.leaveType || '—', level: 'amber' }) },
  ];

  style(code: string) {
    return CODE_STYLE[code] ?? 'bg-surface-subtle text-ink-500';
  }

  async override() {
    if (!this.ui.requires('Manage Leave & Attendance')) return;
    const v = await this.ui.form({
      title: 'Record leave override', subtitle: "Applies to today. The source WFO record is not altered — the override is kept and audited.", icon: 'edit_calendar', submitLabel: 'Save override',
      values: { code: 'S/L', date: new Date().toISOString().slice(0, 10) },
      fields: [
        { key: 'agentId', label: 'Agent', type: 'select', required: true, options: this.agents().map((a) => ({ value: a.id, label: `${a.name} · ${a.employeeId}` })) },
        { key: 'date', label: 'Day', type: 'date', required: true },
        { key: 'code', label: 'Code', type: 'select', required: true, options: LEAVE_LEGEND.map((l) => ({ value: l.code, label: `${l.code} — ${l.meaning}` })) },
        { key: 'note', label: 'Note (optional)', type: 'textarea' },
      ],
    });
    if (!v) return;
    if (v['date'] === new Date().toISOString().slice(0, 10)) {
      this.store.recordLeave(v['agentId'], v['code'], v['note']);
      this.ui.toast('Leave override saved and audited.');
    } else {
      this.ui.toast('An override applies to today only — earlier days come from the WFO sync.');
    }
  }

  async reclassify(row: Agent) {
    if (!this.ui.requires('Manage Leave & Attendance')) return;
    const v = await this.ui.form({
      title: `Reclassify ${row.name}`, subtitle: `Currently: ${row.leaveType}`, icon: 'swap_horiz', submitLabel: 'Save',
      values: { code: 'S/L' },
      fields: [
        { key: 'code', label: 'New code', type: 'select', required: true, options: LEAVE_LEGEND.map((l) => ({ value: l.code, label: `${l.code} — ${l.meaning}` })) },
        { key: 'note', label: 'Note (optional)', type: 'textarea' },
      ],
    });
    if (!v) return;
    this.store.recordLeave(row.id, v['code'], v['note']);
    this.ui.toast(v['code'] === 'P' ? `${row.name} returned to present.` : `${row.name} reclassified to ${v['code']}.`);
  }

  exportSheet() {
    this.ui.xlsx(`attendance-timesheet-${this.month()}`, this.matching().map((a) => ({ Agent: a.name, 'Employee ID': a.employeeId, Queue: a.queue, Vendor: a.vendor, ...Object.fromEntries(this.effectiveDays().map((d) => [d, this.store.attendanceOn(a, d)])) })), 'Attendance');
  }
}
