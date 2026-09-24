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
const CYCLE = ['P', 'A', 'S/L', 'C/L', 'OFF'];

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
      <button mat-stroked-button (click)="exportSheet()"><mat-icon class="!text-base !mr-1">download</mat-icon>Export sheet</button>
      <button mat-flat-button color="primary" (click)="override()" appRequires="Manage Leave & Attendance"><mat-icon class="!text-base !mr-1">edit_calendar</mat-icon>Record leave override</button>
    </app-page-header>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      @for (c of cards(); track c.label) {
        <div class="surface-card px-4 py-3"><div class="text-[11px] font-bold text-ink-400 uppercase tracking-wide">{{ c.label }}</div><div class="text-lg font-extrabold" [class]="c.tone">{{ c.value }}</div></div>
      }
    </div>

    <mat-tab-group>
      <mat-tab [label]="isCurrent() ? 'On leave today' : 'Leave in ' + monthLabel(month())">
        <div class="pt-4">
          @if (isCurrent()) {
            <app-data-table title="Agents on leave" [columns]="columns" [rows]="onLeave()" (rowClick)="reclassify($event)" emptyTitle="No one is on leave today" emptyDescription="All agents are scheduled as present or off."></app-data-table>
            <p class="text-xs text-ink-400 mt-3">Click a row to reclassify the leave type or return the agent to present.</p>
          } @else {
            <app-data-table [title]="'Agents with leave in ' + monthLabel(month())" [columns]="monthColumns" [rows]="monthLeave()" emptyTitle="No leave that month" emptyDescription="Every agent was present, off or absent."></app-data-table>
            <p class="text-xs text-ink-400 mt-3">A past month is read-only. Its day-by-day codes are on the attendance sheet tab.</p>
          }
        </div>
      </mat-tab>

      <mat-tab [label]="'Attendance sheet · ' + monthLabel(month())">
        <div class="pt-4">
          <div class="surface-card p-4 mb-4">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-ink-500 mb-3">Leave Code Legend</h3>
            <div class="flex flex-wrap gap-2">
              @for (l of legend; track l.code) {
                <span class="text-xs rounded-full px-3 py-1" [class]="style(l.code)">
                  <span class="font-semibold">{{ l.code }}</span> &mdash; {{ l.meaning }}@if (l.notes) {<span class="opacity-70"> ({{ l.notes }})</span>}
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
                <span class="text-xs font-semibold text-ink-400 bg-surface-subtle rounded-full px-2.5 py-1 whitespace-nowrap hidden xs:inline-block">{{ sheet().length }} of {{ store.agents().length }}</span>
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
                    @for (d of monthDays(); track d) { <th class="sticky top-0 z-10 !px-1 text-center border-b border-surface-border">{{ d.slice(8) }}</th> }
                  </tr>
                </thead>
                <tbody>
                  @for (a of sheet(); track a.id) {
                    <tr>
                      <td class="sticky left-0 z-10 bg-white"><div class="font-semibold text-ink-900 text-[13px] truncate max-w-[200px]">{{ a.name }}</div><div class="text-[11px] text-ink-400 mt-0.5">{{ a.queue }}</div></td>
                      @for (d of monthDays(); track d) {
                        <td class="!px-1 !py-2 text-center">
                          @if (liveIndex(d) >= 0) {
                            <button (click)="cycle(a.id, liveIndex(d), store.attendanceOn(a, d))" class="block w-full max-w-[46px] mx-auto rounded-lg py-1.5 text-[11px] font-bold border border-transparent hover:border-brand-300 transition-colors" [class]="style(store.attendanceOn(a, d))">{{ store.attendanceOn(a, d) }}</button>
                          } @else if (store.attendanceOn(a, d)) {
                            <span class="block w-full max-w-[46px] mx-auto rounded-lg py-1.5 text-[11px] font-bold" [class]="style(store.attendanceOn(a, d))">{{ store.attendanceOn(a, d) }}</span>
                          } @else { <span class="text-ink-300 text-[11px]">&middot;</span> }
                        </td>
                      }
                    </tr>
                  } @empty {
                    <tr><td [attr.colspan]="monthDays().length + 1" class="text-center text-ink-400 !py-10">No agents match your filter.</td></tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="p-3.5 border-t border-surface-border text-xs text-ink-400">The last 14 days come live from WFO and can be edited: click a cell to cycle P → A → S/L → C/L → OFF, or use “Record leave override” for other codes. Earlier days are history and read-only. Billable days used by the Reconciliation Workspace come from the live days.</div>
          </div>
        </div>
      </mat-tab>
    </mat-tab-group>
  `,
})
export class LeaveManagementComponent {
  store = inject(CrcStore);
  private ui = inject(UiService);
  private router = inject(Router);

  legend = LEAVE_LEGEND;
  days = this.store.attendanceDays;
  q = signal('');
  vendor = signal('All');
  readonly months = [...this.store.payrollMonths()].reverse();
  month = signal(this.months[0]);
  isCurrent = computed(() => this.month() === this.months[0]);
  /** Every day of the selected month, 'YYYY-MM-DD'. */
  monthDays = computed(() => {
    const [y, m] = this.month().split('-').map(Number);
    return Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => `${this.month()}-${String(i + 1).padStart(2, '0')}`);
  });
  private codeMeaning = Object.fromEntries(LEAVE_LEGEND.map((l) => [l.code, l.meaning]));

  /** Today's counts in the current month; day totals across the month for a past one. */
  cards = computed(() => {
    if (this.isCurrent()) {
      const t = this.today();
      return [
        { label: 'Present today', value: t['Present'], tone: 'text-status-normal' }, { label: 'On leave', value: t['On Leave'], tone: 'text-status-amber' },
        { label: 'Off day', value: t['Off'], tone: 'text-ink-700' }, { label: 'Absent', value: t['Absent'], tone: 'text-status-red' },
      ];
    }
    const n = { P: 0, leave: 0, OFF: 0, A: 0 };
    for (const a of this.store.agents()) for (const d of this.monthDays()) {
      const c = this.store.attendanceOn(a, d);
      if (c === 'P' || c === 'OFF' || c === 'A') n[c]++; else if (c) n.leave++;
    }
    return [
      { label: 'Present days', value: n.P, tone: 'text-status-normal' }, { label: 'Leave days', value: n.leave, tone: 'text-status-amber' },
      { label: 'Off days', value: n.OFF, tone: 'text-ink-700' }, { label: 'Absent days', value: n.A, tone: 'text-status-red' },
    ];
  });

  /** Agents with leave in a past month: their main leave type and how many days. */
  monthLeave = computed(() => this.store.agents().map((a) => {
    const counts: Record<string, number> = {};
    for (const d of this.monthDays()) { const c = this.store.attendanceOn(a, d); if (c && c !== 'P' && c !== 'OFF' && c !== 'A') counts[c] = (counts[c] ?? 0) + 1; }
    const codes = Object.keys(counts).sort((x, y) => counts[y] - counts[x]);
    return { ...a, leaveType: codes.map((c) => this.codeMeaning[c] ?? c).join(', '), leaveDays: codes.reduce((s, c) => s + counts[c], 0) };
  }).filter((r) => r.leaveDays > 0));

  monthColumns: TableColumn<any>[] = [
    { key: 'name', label: 'Agent' },
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'queue', label: 'Queue' },
    { key: 'leaveType', label: 'Leave Type', type: 'status', statusFn: (r) => ({ label: r.leaveType, level: 'amber' }) },
    { key: 'leaveDays', label: 'Leave days', type: 'number', align: 'right' },
  ];

  liveIndex(day: string) {
    return this.days().indexOf(day);
  }

  monthLabel(m: string) {
    const [y, mo] = m.split('-').map(Number);
    return new Date(y, mo - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  }

  onLeave = computed(() => this.store.agents().filter((a) => a.status === 'On Leave'));
  today = computed(() => {
    const c: Record<string, number> = { Present: 0, 'On Leave': 0, Off: 0, Absent: 0 };
    for (const a of this.store.agents()) c[a.status]++;
    return c;
  });
  sheet = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.store.agents().filter((a) => (this.vendor() === 'All' || a.vendor === this.vendor()) && (!q || a.name.toLowerCase().includes(q) || a.queue.toLowerCase().includes(q))).slice(0, 60);
  });

  columns: TableColumn<Agent>[] = [
    { key: 'name', label: 'Agent' },
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'queue', label: 'Queue' },
    { key: 'leaveType', label: 'Leave Type', type: 'status', statusFn: (r) => ({ label: r.leaveType || '—', level: 'amber' }) },
  ];

  style(code: string) {
    return CODE_STYLE[code] ?? 'bg-surface-subtle text-ink-500';
  }

  cycle(agentId: string, dayIndex: number, code: string) {
    if (!this.ui.requires('Manage Leave & Attendance')) return;
    const next = CYCLE[(CYCLE.indexOf(code) + 1) % CYCLE.length];
    this.store.setAttendance(agentId, dayIndex, next);
  }

  async override() {
    if (!this.ui.requires('Manage Leave & Attendance')) return;
    const v = await this.ui.form({
      title: 'Record leave override', subtitle: "Applies to today. The source WFO record is not altered — the override is kept and audited.", icon: 'edit_calendar', submitLabel: 'Save override',
      values: { code: 'S/L' },
      fields: [
        { key: 'agentId', label: 'Agent', type: 'select', required: true, options: this.store.agents().map((a) => ({ value: a.id, label: `${a.name} · ${a.employeeId}` })) },
        { key: 'code', label: 'Code', type: 'select', required: true, options: LEAVE_LEGEND.map((l) => ({ value: l.code, label: `${l.code} — ${l.meaning}` })) },
        { key: 'note', label: 'Note (optional)', type: 'textarea' },
      ],
    });
    if (!v) return;
    this.store.recordLeave(v['agentId'], v['code'], v['note']);
    this.ui.toast('Leave override saved and audited.');
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
    this.ui.csv(`attendance-sheet-${this.month()}`, this.sheet().map((a) => ({ Agent: a.name, 'Employee ID': a.employeeId, Queue: a.queue, Vendor: a.vendor, ...Object.fromEntries(this.monthDays().map((d) => [d, this.store.attendanceOn(a, d)])) })));
  }
}
