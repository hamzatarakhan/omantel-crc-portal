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
          <div class="text-sm font-semibold text-ink-900">Loaded <span class="text-brand-700">{{ info.fileName }}</span></div>
          <div class="text-xs text-ink-500">{{ info.employees }} employees &middot; {{ info.days }} attendance days &middot; {{ info.resignations }} resignation(s) &middot; billing month {{ info.period }}</div>
        } @else {
          <div class="text-sm font-semibold text-ink-900">Showing sample data</div>
          <div class="text-xs text-ink-500">Import the vendor's monthly annexure workbook (.xlsx) to see the real employees, rates and attendance. The file is read in your browser only — nothing is uploaded or stored.</div>
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

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
      <div class="surface-card overflow-x-auto">
        <div class="px-4 pt-3.5"><h3 class="text-[13.5px] font-bold text-ink-900">Total billing</h3><p class="text-xs text-ink-400 mt-0.5">{{ store.period() }} &middot; {{ vendor() }}</p></div>
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

    <mat-tab-group>
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

  calc = computed(() => this.store.calculateInvoice(this.vendor()));
  existingCount = computed(() => this.calc().existing.length);
  totalPayroll = computed(() => this.calc().tiers.reduce((s, t) => s + t.payroll, 0));
  totalFee = computed(() => this.calc().tiers.reduce((s, t) => s + t.fee, 0));

  private line(a: { name: string; queue: string; employeeId: string; degree: string; nationality?: string; joinDate: string; id: string }) {
    const pay = this.store.payroll()[a.id] ?? this.store.payrollFor(a as any);
    return { name: a.name, queue: a.queue, employeeId: a.employeeId, residentId: pay.residentId, degree: a.degree, nationality: a.nationality ?? 'Oman', joinDate: a.joinDate, basic: pay.basic, hra: pay.hra, conveyance: pay.conveyance, special: pay.special, other: pay.other, gross: pay.gross, fee: pay.managementFee, otHours: this.store.overtimeFor(a as any).hours, additional: pay.additional ?? 0, deduction: pay.deduction ?? 0, billingRate: pay.billingRate };
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
    { key: 'otHours', label: 'OT hours', type: 'number', align: 'right' }, { key: 'additional', label: 'Overtime', type: 'money', align: 'right', decimals: 2 }, { key: 'deduction', label: 'Deduction', type: 'money', align: 'right', decimals: 2 },
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
