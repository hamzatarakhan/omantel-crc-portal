import { Component, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { RequiresDirective } from '../../../shared/directives/requires.directive';
import { parseAnnexure } from '../../../core/services/annexure-import';

/** The vendor's monthly annexure: totals by degree plus the per-employee lists behind the tax invoice. */
@Component({
  selector: 'app-annexure',
  standalone: true,
  imports: [CommonModule, MatTabsModule, MatIconModule, DataTableComponent, RequiresDirective],
  template: `
    <div class="surface-card px-4 py-3 mb-4 flex items-center gap-3 flex-wrap">
      <mat-icon class="!text-brand-600">upload_file</mat-icon>
      <div class="flex-1 min-w-[240px]">
        @if (store.importInfo(); as info) {
          <div class="text-sm font-semibold text-ink-900">Compared against <span class="text-brand-700">{{ info.fileName }}</span></div>
          <div class="text-xs text-ink-500">{{ info.employees }} employees &middot; {{ info.days }} attendance days &middot; {{ info.resignations }} resignation(s) &middot; billing month {{ info.period }} &middot; our own agent, payroll and attendance data (synced daily from the WFO) is unchanged</div>
        } @else {
          <div class="text-sm font-semibold text-ink-900">No annexure imported yet</div>
          <div class="text-xs text-ink-500">Import the vendor's monthly annexure workbook (.xlsx) to compare their claimed amount against our WFO calculation below. The file is read in your browser only — nothing is uploaded or stored, and it never changes our own data.</div>
        }
      </div>
      <label class="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg border border-brand-600 text-brand-600 hover:bg-brand-50 cursor-pointer transition-colors" appRequires="Validate Invoice">
        <mat-icon class="!text-lg">folder_open</mat-icon>{{ store.importInfo() ? 'Import another workbook' : 'Import annexure workbook' }}
        <input type="file" accept=".xlsx" class="hidden" (change)="import($event)" />
      </label>
    </div>

    @if (loading()) {
      <div class="status-chip status-chip--info mb-4">Reading the workbook…</div>
    }

    @if (claim(); as c) {
      <div class="surface-card px-4 py-4 mb-4">
        <h3 class="text-[13.5px] font-bold text-ink-900 mb-3">Vendor's claim vs. our calculation</h3>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          <div><div class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Our calculation</div><div class="text-lg font-bold text-ink-900 mt-1">{{ calc().subtotal | number:'1.2-2' }} OMR</div></div>
          <div><div class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Vendor's claim</div><div class="text-lg font-bold text-ink-900 mt-1">{{ c.total | number:'1.2-2' }} OMR</div></div>
          <div><div class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Difference</div><div class="text-lg font-bold mt-1" [class.text-status-red]="claimDiff() > 0.005 || claimDiff() < -0.005">{{ claimDiff() > 0 ? '+' : '' }}{{ claimDiff() | number:'1.2-2' }} OMR</div></div>
        </div>
        <table class="crc-table w-full">
          <thead><tr class="text-left"><th>Component</th><th class="text-right">Our calculation</th><th class="text-right">Vendor's claim</th><th class="text-right">Difference</th></tr></thead>
          <tbody>
            @for (row of claimRows(); track row.label) {
              <tr><td>{{ row.label }}</td><td class="text-right">{{ row.ours | number:'1.2-2' }}</td><td class="text-right">{{ row.theirs | number:'1.2-2' }}</td><td class="text-right" [class.text-status-red]="row.diff > 0.005 || row.diff < -0.005">{{ row.diff > 0 ? '+' : '' }}{{ row.diff | number:'1.2-2' }}</td></tr>
            }
          </tbody>
        </table>
        <p class="text-[11px] text-ink-400 mt-2">The vendor's claim comes from their own file's billing rate × their own attendance (Salary) and "Additional" column (Overtime); Performance and the 3 Clicks incentive are ours to calculate and are not on their file.</p>
      </div>
    }

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
      <div class="surface-card overflow-x-auto">
        <div class="px-4 pt-3.5"><h3 class="text-[13.5px] font-bold text-ink-900">Our calculation &middot; total billing</h3><p class="text-xs text-ink-400 mt-0.5">{{ store.period() }} &middot; {{ vendor() }} &middot; from the WFO</p></div>
        <table class="crc-table w-full mt-3">
          <thead><tr class="text-left"><th>Category</th><th class="text-right">Amount (OMR)</th></tr></thead>
          <tbody>
            <tr><td>Monthly payroll + management fee <span class="text-xs text-ink-400">({{ existingCount() }} employees)</span></td><td class="text-right">{{ calc().gross | number:'1.3-3' }}</td></tr>
            <tr><td>Resignation payroll + management fee + leave encashment <span class="text-xs text-ink-400">({{ calc().resignation.units }})</span></td><td class="text-right">{{ calc().resignation.amount | number:'1.3-3' }}</td></tr>
            <tr><td>New joining payroll + management fee, pro-rata <span class="text-xs text-ink-400">({{ calc().newJoining.units }})</span></td><td class="text-right">{{ calc().newJoining.amount | number:'1.3-3' }}</td></tr>
            <tr><td>Absentees deduction <span class="text-xs text-ink-400">({{ calc().absentDays }} day(s))</span></td><td class="text-right" [class.text-status-red]="calc().absenceDeduction > 0">{{ calc().absenceDeduction > 0.0005 ? '-' : '' }}{{ calc().absenceDeduction | number:'1.3-3' }}</td></tr>
            <tr><td>3 Clicks incentive <span class="text-xs text-ink-400">(calls of {{ calc().threshold }}s or more)</span></td><td class="text-right" [class.text-ink-400]="!calc().incentiveIncluded">{{ calc().incentive | number:'1.3-3' }}{{ calc().incentiveIncluded ? '' : ' (not billed)' }}</td></tr>
          </tbody>
          <tfoot><tr class="font-bold"><td class="!text-ink-900">Total billing (excl. VAT)</td><td class="text-right !text-brand-700">{{ calc().subtotal | number:'1.3-3' }}</td></tr></tfoot>
        </table>
      </div>

      <div class="surface-card overflow-x-auto">
        <div class="px-4 pt-3.5"><h3 class="text-[13.5px] font-bold text-ink-900">By degree</h3><p class="text-xs text-ink-400 mt-0.5">Existing staff, before absence deduction</p></div>
        <table class="crc-table w-full mt-3">
          <thead><tr class="text-left"><th>Category</th><th class="text-right">Monthly payroll</th><th class="text-right">Management fee</th><th class="text-right">Total amount</th></tr></thead>
          <tbody>
            @for (t of calc().tiers; track t.degree) {
              <tr><td>{{ t.degree }} <span class="text-xs text-ink-400">({{ t.headcount }})</span></td><td class="text-right">{{ t.payroll | number:'1.3-3' }}</td><td class="text-right">{{ t.fee | number:'1.3-3' }}</td><td class="text-right">{{ t.gross | number:'1.3-3' }}</td></tr>
            }
          </tbody>
          <tfoot><tr class="font-bold"><td class="!text-ink-900">Total</td><td class="text-right">{{ totalPayroll() | number:'1.3-3' }}</td><td class="text-right">{{ totalFee() | number:'1.3-3' }}</td><td class="text-right !text-brand-700">{{ calc().gross | number:'1.3-3' }}</td></tr></tfoot>
        </table>
      </div>
    </div>

    <mat-tab-group [(selectedIndex)]="tab">
      <mat-tab [label]="'Employee comparison' + (cmp() ? ' (' + cmpMismatches() + ' differ)' : '')">
        <div class="pt-4">
          @if (!cmp()) {
            <div class="rounded-xl border border-dashed border-surface-border bg-white p-8 text-center text-sm text-ink-500">Import the vendor's annexure above to compare it with our calculation employee by employee.</div>
          } @else {
            <div class="rounded-xl border border-surface-border bg-white">
              <div class="p-3 flex flex-wrap items-center gap-2 border-b border-surface-border">
                @for (f of cmpFilters; track f) {
                  <button type="button" class="h-8 px-3 rounded-full text-xs font-semibold border border-solid" [class]="filter() === f ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-ink-700 border-surface-border hover:bg-surface-subtle'" (click)="filter.set(f); page.set(0)">{{ f }} <span class="opacity-70">{{ countOf(f) }}</span></button>
                }
                <input class="ml-auto h-8 w-56 rounded-lg border border-solid border-surface-border px-2.5 text-sm" placeholder="Search name or ID" [value]="search()" (input)="search.set($any($event.target).value); page.set(0)" />
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead><tr class="text-left text-xs text-ink-500 bg-surface-subtle">
                    <th class="px-3 py-2">Employee</th><th class="px-3 py-2">Queue</th><th class="px-3 py-2 text-right">Vendor annexure</th><th class="px-3 py-2 text-right">Our calculation</th><th class="px-3 py-2 text-right">Difference</th><th class="px-3 py-2">Where it differs</th>
                  </tr></thead>
                  <tbody>
                    @for (r of pageRows(); track r.key) {
                      <tr class="border-t border-surface-border align-top">
                        <td class="px-3 py-2"><div class="font-semibold text-ink-900">{{ r.name }}</div><div class="text-xs text-ink-500">ID {{ r.employeeId }} · {{ r.degree }}{{ r.kind === 'Resignation' ? ' · resignation' : '' }}</div></td>
                        <td class="px-3 py-2 text-ink-700">{{ r.queue }}</td>
                        <td class="px-3 py-2 text-right tabular-nums">{{ r.theirs | number:'1.2-2' }}</td>
                        <td class="px-3 py-2 text-right tabular-nums">{{ r.ours | number:'1.2-2' }}</td>
                        <td class="px-3 py-2 text-right tabular-nums font-semibold" [class]="r.status === 'Matches' ? 'text-status-green' : 'text-status-red'">{{ r.status === 'Matches' ? 'Matches' : (r.diff > 0 ? '+' : '−') + (abs(r.diff) | number:'1.2-2') }}</td>
                        <td class="px-3 py-2">
                          @if (r.status === 'Matches') { <span class="text-ink-400">—</span> } @else {
                            <div class="flex flex-wrap gap-1">
                              <span class="px-1.5 py-0.5 rounded bg-surface-subtle text-ink-700 text-xs font-medium">{{ r.status }}</span>
                              @for (why of r.reasons; track why) { <span class="px-1.5 py-0.5 rounded bg-red-50 text-status-red text-xs font-medium">{{ why }}</span> }
                            </div>
                            @if (r.days.length) { <div class="text-xs text-status-amber mt-1">Attendance differs on day{{ r.days.length > 1 ? 's' : '' }} {{ dayText(r) }}</div> }
                          }
                        </td>
                      </tr>
                    } @empty { <tr><td colspan="6" class="px-3 py-8 text-center text-ink-500">Nothing to show for this filter.</td></tr> }
                  </tbody>
                </table>
              </div>
              <div class="p-3 flex items-center justify-between text-xs text-ink-500 border-t border-surface-border">
                <span>{{ filtered().length }} employee{{ filtered().length === 1 ? '' : 's' }} · annexure {{ cmp()!.fileName }}</span>
                <span class="flex items-center gap-2">
                  <button type="button" class="h-7 px-2.5 rounded border border-solid border-surface-border disabled:opacity-40" [disabled]="page() === 0" (click)="page.set(page() - 1)">Previous</button>
                  Page {{ page() + 1 }} of {{ pages() }}
                  <button type="button" class="h-7 px-2.5 rounded border border-solid border-surface-border disabled:opacity-40" [disabled]="page() + 1 >= pages()" (click)="page.set(page() + 1)">Next</button>
                </span>
              </div>
            </div>
          }
        </div>
      </mat-tab>
      <mat-tab [label]="'Employee billing rates (' + employeeRows().length + ')'">
        <div class="pt-4"><app-data-table title="Monthly billing rate per employee" [columns]="employeeColumns" [rows]="employeeRows()" [pageSize]="10"></app-data-table></div>
      </mat-tab>
      <mat-tab [label]="'New joiners (' + joinerRows().length + ')'">
        <div class="pt-4"><app-data-table title="New joiners" [columns]="joinerColumns" [rows]="joinerRows()" emptyTitle="No new joiners this month" emptyDescription="Agents whose joining date falls in the billing month appear here and are billed pro-rata."></app-data-table></div>
      </mat-tab>
      <mat-tab [label]="'Resignations (' + resignationRows().length + ')'">
        <div class="pt-4"><app-data-table title="Resignations" [columns]="resignationColumns" [rows]="resignationRows()" emptyTitle="No resignations this month" emptyDescription="Record a resignation from the agent's profile."></app-data-table></div>
      </mat-tab>
      <mat-tab [label]="'Absentees (' + absenteeRows().length + ')'">
        <div class="pt-4"><app-data-table title="Absentees" [columns]="absenteeColumns" [rows]="absenteeRows()" emptyTitle="No absences this month" emptyDescription="Days marked A on the attendance sheet appear here with their deduction."></app-data-table></div>
      </mat-tab>
    </mat-tab-group>
  `,
})
export class AnnexureComponent {
  store = inject(CrcStore);
  private ui = inject(UiService);
  vendor = input.required<string>();
  loading = signal(false);

  tab = signal(0);
  filter = signal('Mismatches');
  search = signal('');
  page = signal(0);
  readonly cmpFilters = ['Mismatches', 'Only on vendor annexure', 'Only in our WFO', 'Matches', 'All'];
  cmp = computed(() => this.store.annexureEmployees(this.vendor()));
  cmpMismatches = computed(() => this.cmp()?.rows.filter((r) => r.status !== 'Matches').length ?? 0);
  countOf(f: string) { const rows = this.cmp()?.rows ?? []; return f === 'All' ? rows.length : rows.filter((r) => this.inFilter(r.status, f)).length; }
  private inFilter(status: string, f: string) { return f === 'All' || (f === 'Mismatches' ? status !== 'Matches' : status === f); }
  filtered = computed(() => {
    const q = this.search().trim().toLowerCase(), f = this.filter();
    return (this.cmp()?.rows ?? []).filter((r) => this.inFilter(r.status, f) && (!q || r.name.toLowerCase().includes(q) || r.employeeId.toLowerCase().includes(q)));
  });
  pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / 15)));
  pageRows = computed(() => this.filtered().slice(this.page() * 15, this.page() * 15 + 15));
  abs = Math.abs;
  dayText(r: { days: Array<{ day: number; vendor: string; ours: string }> }) { return r.days.slice(0, 8).map((d) => d.day + ' (vendor ' + d.vendor + ', ours ' + d.ours + ')').join(', ') + (r.days.length > 8 ? ' …' : ''); }

  calc = computed(() => this.store.calculateInvoice(this.vendor()));
  existingCount = computed(() => this.calc().existing.length);
  totalPayroll = computed(() => this.calc().tiers.reduce((s, t) => s + t.payroll, 0));
  totalFee = computed(() => this.calc().tiers.reduce((s, t) => s + t.fee, 0));

  /** The vendor's own annexure claim, read once for comparison — never a source for our own figures above. */
  claim = computed(() => this.store.vendorAnnexures()[this.vendor()]);
  claimDiff = computed(() => { const c = this.claim(); return c ? Math.round((c.total - this.calc().subtotal) * 1000) / 1000 : 0; });
  claimRows = computed(() => {
    const c = this.claim(), k = this.calc();
    if (!c) return [];
    const rows: Array<{ label: string; ours: number; theirs?: number }> = [
      { label: 'Salary (incl. new joiners & resignations)', ours: k.salaryBase + k.newJoining.amount + k.resignation.amount, theirs: c.claim.salary },
      { label: 'Overtime', ours: k.overtimeBase, theirs: c.claim.overtime },
    ];
    return rows.filter((r) => r.theirs !== undefined).map((r) => ({ ...r, theirs: r.theirs as number, diff: Math.round(((r.theirs as number) - r.ours) * 1000) / 1000 }));
  });

  private line(a: { name: string; queue: string; employeeId: string; degree: string; nationality?: string; joinDate: string; id: string }) {
    const pay = this.store.payroll()[a.id] ?? this.store.payrollFor(a as any);
    return { name: a.name, queue: a.queue, employeeId: a.employeeId, residentId: pay.residentId, degree: a.degree, nationality: a.nationality ?? 'Oman', joinDate: a.joinDate, basic: pay.basic, hra: pay.hra, conveyance: pay.conveyance, special: pay.special, other: pay.other, gross: pay.gross, fee: pay.managementFee, otHours: this.store.overtimeFor(a as any).hours, additional: this.store.overtimeFor(a as any).amount, score: this.store.performanceFor(a as any).score, performance: this.store.performanceFor(a as any).amount, deduction: pay.deduction ?? 0, billingRate: pay.billingRate };
  }

  employeeRows = computed(() => this.calc().existing.map((a, i) => ({ no: i + 1, ...this.line(a) })));
  joinerRows = computed(() => this.calc().newJoiners.map((j) => ({ ...this.line(j.agent), daysBilled: j.daysBilled, prorated: j.prorated })));
  resignationRows = computed(() => this.calc().resignationRecords.map((r) => ({ ...r, fee: r.managementFee })));
  absenteeRows = computed(() => this.calc().absentees.map((x) => ({ name: x.agent.name, queue: x.agent.queue, employeeId: x.agent.employeeId, degree: x.agent.degree, absentDays: x.absentDays, rate: x.rate, deduction: x.deduction })));

  private base: TableColumn<any>[] = [
    { key: 'name', label: 'Employee' }, { key: 'queue', label: 'Queue' }, { key: 'employeeId', label: 'Employee ID' },
  ];
  private pay: TableColumn<any>[] = [
    { key: 'basic', label: 'Basic', type: 'money', align: 'right' }, { key: 'hra', label: 'HRA', type: 'money', align: 'right', decimals: 2 },
    { key: 'conveyance', label: 'Conveyance', type: 'money', align: 'right', decimals: 2 }, { key: 'special', label: 'Special', type: 'money', align: 'right', decimals: 2 },
    { key: 'other', label: 'Other', type: 'money', align: 'right', decimals: 2 }, { key: 'gross', label: 'Gross', type: 'money', align: 'right' },
    { key: 'fee', label: 'Mgmt fee', type: 'money', align: 'right', decimals: 2 },
    { key: 'otHours', label: 'OT hours', type: 'number', align: 'right' }, { key: 'additional', label: 'Overtime', type: 'money', align: 'right', decimals: 2 }, { key: 'score', label: 'Score %', type: 'number', align: 'right' }, { key: 'performance', label: 'Performance', type: 'money', align: 'right', decimals: 2 }, { key: 'deduction', label: 'Deduction', type: 'money', align: 'right', decimals: 2 },
  ];

  employeeColumns: TableColumn<any>[] = [
    { key: 'no', label: '#' }, ...this.base, { key: 'residentId', label: 'Resident ID' }, { key: 'degree', label: 'Degree' }, { key: 'nationality', label: 'Nationality' },
    { key: 'joinDate', label: 'Joined', type: 'date' }, ...this.pay, { key: 'billingRate', label: 'Billing rate', type: 'money', align: 'right' },
  ];
  joinerColumns: TableColumn<any>[] = [
    ...this.base, { key: 'residentId', label: 'Resident ID' }, { key: 'joinDate', label: 'Joined', type: 'date' }, ...this.pay,
    { key: 'billingRate', label: 'Monthly billing', type: 'money', align: 'right' }, { key: 'daysBilled', label: 'Days billed', type: 'number', align: 'right' }, { key: 'prorated', label: 'Pro-rated', type: 'money', align: 'right' },
  ];
  resignationColumns: TableColumn<any>[] = [
    ...this.base, { key: 'degree', label: 'Degree' }, { key: 'joinDate', label: 'Joined', type: 'date' }, { key: 'resignDate', label: 'Resigned', type: 'date' },
    { key: 'gross', label: 'Gross', type: 'money', align: 'right' }, { key: 'fee', label: 'Mgmt fee', type: 'money', align: 'right', decimals: 2 },
    { key: 'monthlyBilling', label: 'Monthly billing', type: 'money', align: 'right' }, { key: 'absentDays', label: 'Absent days', type: 'number', align: 'right' },
    { key: 'prorated', label: 'Pro-rated', type: 'money', align: 'right' }, { key: 'leaveEncashment', label: 'Leave encashment', type: 'money', align: 'right' }, { key: 'total', label: 'Total', type: 'money', align: 'right' },
  ];
  absenteeColumns: TableColumn<any>[] = [
    ...this.base, { key: 'degree', label: 'Degree' }, { key: 'absentDays', label: 'Absent days', type: 'number', align: 'right' },
    { key: 'rate', label: 'Billing rate', type: 'money', align: 'right' }, { key: 'deduction', label: 'Deduction', type: 'money', align: 'right' },
  ];

  async import(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.ui.requires('Validate Invoice')) return;
    this.loading.set(true);
    try {
      const data = await parseAnnexure(file);
      this.store.importAnnexure(data);
      this.ui.toast(`Loaded ${data.employees.length} employees, ${data.attendance.days.length} attendance days and ${data.resignations.length} resignation(s) from ${file.name}.`, 6000);
    } catch (e) {
      this.ui.toast(e instanceof Error ? e.message : 'The workbook could not be read.', 6000);
    } finally {
      this.loading.set(false);
    }
  }
}
