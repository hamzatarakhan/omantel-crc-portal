import { Component, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { RequiresDirective } from '../../../shared/directives/requires.directive';
import { parseOvertimeFile } from '../../../core/services/overtime-import';

/** The vendor's monthly overtime workbook, checked employee by employee against our own WFO overtime calculation. */
@Component({
  selector: 'app-overtime-file',
  standalone: true,
  imports: [CommonModule, MatIconModule, RequiresDirective],
  template: `
    <div class="surface-card px-4 py-3 mb-4 flex items-center gap-3 flex-wrap">
      <mat-icon class="!text-brand-600">upload_file</mat-icon>
      <div class="flex-1 min-w-[240px]">
        @if (store.overtimeInvoices()[vendor()]; as f) {
          <div class="text-sm font-semibold text-ink-900">Compared against <span class="text-brand-700">{{ f.fileName }}</span></div>
          <div class="text-xs text-ink-500">{{ f.rows.length }} employees &middot; {{ f.total | number:'1.2-2' }} OMR claimed. Our own agent, payroll and attendance data is unchanged.</div>
        } @else {
          <div class="text-sm font-semibold text-ink-900">No overtime file imported yet</div>
          <div class="text-xs text-ink-500">Import the vendor's monthly overtime workbook (.xlsx) to compare their claimed hours and amount against our calculation, employee by employee.</div>
        }
      </div>
      <label class="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg border border-brand-600 text-brand-600 hover:bg-brand-50 cursor-pointer transition-colors" appRequires="Validate Invoice">
        <mat-icon class="!text-lg">folder_open</mat-icon>{{ store.overtimeInvoices()[vendor()] ? 'Import another overtime workbook' : 'Import overtime workbook' }}
        <input type="file" accept=".xlsx" class="hidden" (change)="import($event)" />
      </label>
    </div>

    @if (loading()) { <div class="status-chip status-chip--info mb-4">Reading the workbook…</div> }

    @if (compare(); as c) {
      <div class="surface-card px-4 py-4 mb-4">
        <h3 class="text-[13.5px] font-bold text-ink-900 mb-3">Vendor's overtime file vs. our calculation</h3>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          <div><div class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Our calculation</div><div class="text-lg font-bold text-ink-900 mt-1">{{ ourTotal() | number:'1.2-2' }} OMR</div></div>
          <div><div class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Vendor's claim</div><div class="text-lg font-bold text-ink-900 mt-1">{{ theirTotal() | number:'1.2-2' }} OMR</div></div>
          <div><div class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Difference</div><div class="text-lg font-bold mt-1" [class.text-status-red]="diffAbs() >= 0.005">{{ diff() > 0 ? '+' : '' }}{{ diff() | number:'1.2-2' }} OMR</div></div>
        </div>

        <div class="p-3 flex flex-wrap items-center gap-2 border-t border-surface-border">
          @for (f of filters; track f) {
            <button type="button" class="h-8 px-3 rounded-full text-xs font-semibold border border-solid" [class]="filter() === f ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-ink-700 border-surface-border hover:bg-surface-subtle'" (click)="filter.set(f); page.set(0)">{{ f }} <span class="opacity-70">{{ countOf(f) }}</span></button>
          }
          <input class="ml-auto h-8 w-56 rounded-lg border border-solid border-surface-border px-2.5 text-sm" placeholder="Search name or ID" [value]="search()" (input)="search.set($any($event.target).value); page.set(0)" />
        </div>
        <div class="overflow-x-auto">
          <table class="crc-table w-full">
            <thead><tr class="text-left"><th>Employee</th><th>Queue</th><th class="text-right">Vendor hours</th><th class="text-right">Our hours</th><th class="text-right">Vendor amount</th><th class="text-right">Our amount</th><th class="text-right">Difference</th><th>Where it differs</th></tr></thead>
            <tbody>
              @for (r of pageRows(); track r.employeeId) {
                <tr>
                  <td><div class="font-semibold text-ink-900">{{ r.name }}</div><div class="text-[11px] text-ink-400">ID {{ r.employeeId }}</div></td>
                  <td class="text-ink-700">{{ r.queue }}</td>
                  <td class="text-right tabular-nums">{{ r.theirsHours | number:'1.1-1' }}</td>
                  <td class="text-right tabular-nums">{{ r.oursHours | number:'1.1-1' }}</td>
                  <td class="text-right tabular-nums">{{ r.theirsAmount | number:'1.2-2' }}</td>
                  <td class="text-right tabular-nums">{{ r.oursAmount | number:'1.2-2' }}</td>
                  <td class="text-right tabular-nums font-semibold" [class]="r.status === 'Matches' ? 'text-status-green' : 'text-status-red'">{{ r.status === 'Matches' ? 'Matches' : (r.diff > 0 ? '+' : '') + (r.diff | number:'1.2-2') }}</td>
                  <td class="!whitespace-normal">
                    @if (r.status === 'Matches') { <span class="text-ink-400">—</span> } @else {
                      <div class="flex flex-wrap gap-1">
                        <span class="px-1.5 py-0.5 rounded bg-surface-subtle text-ink-700 text-xs font-medium">{{ r.status }}</span>
                        @for (why of r.reasons; track why) { <span class="px-1.5 py-0.5 rounded bg-red-50 text-status-red text-xs font-medium">{{ why }}</span> }
                      </div>
                    }
                  </td>
                </tr>
              } @empty { <tr><td colspan="8" class="!text-center text-sm text-ink-400 !py-8">Nothing to show for this filter.</td></tr> }
            </tbody>
          </table>
        </div>
        <div class="p-3 flex items-center justify-between text-xs text-ink-500 border-t border-surface-border">
          <span>{{ filtered().length }} employee{{ filtered().length === 1 ? '' : 's' }} &middot; {{ c.fileName }}</span>
          <span class="flex items-center gap-2">
            <button type="button" class="h-7 px-2.5 rounded border border-solid border-surface-border disabled:opacity-40" [disabled]="page() === 0" (click)="page.set(page() - 1)">Previous</button>
            Page {{ page() + 1 }} of {{ pages() }}
            <button type="button" class="h-7 px-2.5 rounded border border-solid border-surface-border disabled:opacity-40" [disabled]="page() + 1 >= pages()" (click)="page.set(page() + 1)">Next</button>
          </span>
        </div>
      </div>
    }
  `,
})
export class OvertimeFileComponent {
  store = inject(CrcStore);
  private ui = inject(UiService);
  vendor = input.required<string>();
  loading = signal(false);

  filter = signal('Different');
  search = signal('');
  page = signal(0);
  readonly filters = ['Different', 'Only on vendor file', 'Only in our records', 'Matches', 'All'];

  compare = computed(() => this.store.overtimeEmployees(this.vendor()));
  ourTotal = computed(() => (this.compare()?.rows ?? []).reduce((s, r) => s + r.oursAmount, 0));
  theirTotal = computed(() => this.store.overtimeClaim(this.vendor()) ?? 0);
  diff = computed(() => Math.round((this.theirTotal() - this.ourTotal()) * 1000) / 1000);
  diffAbs = computed(() => Math.abs(this.diff()));

  countOf(f: string) { const rows = this.compare()?.rows ?? []; return f === 'All' ? rows.length : rows.filter((r) => this.inFilter(r.status, f)).length; }
  private inFilter(status: string, f: string) { return f === 'All' || (f === 'Different' ? status !== 'Matches' : status === f); }
  filtered = computed(() => {
    const q = this.search().trim().toLowerCase(), f = this.filter();
    return (this.compare()?.rows ?? []).filter((r) => this.inFilter(r.status, f) && (!q || r.name.toLowerCase().includes(q) || r.employeeId.toLowerCase().includes(q)));
  });
  pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / 15)));
  pageRows = computed(() => this.filtered().slice(this.page() * 15, this.page() * 15 + 15));

  async import(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.ui.requires('Validate Invoice')) return;
    this.loading.set(true);
    try {
      const data = await parseOvertimeFile(file);
      this.store.importOvertimeInvoice(this.vendor(), data);
      this.ui.toast(`Loaded ${data.rows.length} employees, ${data.total.toLocaleString('en-GB')} OMR claimed, from ${file.name}.`, 6000);
    } catch (e) {
      this.ui.toast(e instanceof Error ? e.message : 'The workbook could not be read.', 6000);
    } finally {
      this.loading.set(false);
    }
  }
}
