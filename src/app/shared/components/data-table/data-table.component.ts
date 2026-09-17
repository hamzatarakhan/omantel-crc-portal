import { Component, Input, Output, EventEmitter, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { StatusChipComponent } from '../status-chip/status-chip.component';
import { StatusLevel } from '../../../core/models/status';
import { EmptyStateComponent } from '../empty-state/empty-state.component';

export interface TableColumn<T = any> {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'currency' | 'date' | 'status';
  currency?: string;
  statusFn?: (row: T) => { label: string; level: StatusLevel };
  align?: 'left' | 'right';
}

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, StatusChipComponent, EmptyStateComponent],
  template: `
    <div class="surface-card overflow-hidden">
      <div class="flex items-center justify-between gap-3 p-3.5 border-b border-surface-border flex-wrap">
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <div class="relative w-full max-w-[260px]">
            <mat-icon class="!text-ink-400 !text-lg absolute left-2.5 top-1/2 -translate-y-1/2">search</mat-icon>
            <input
              class="pl-9 pr-3 py-2 text-sm rounded-lg border border-surface-border w-full focus:outline-none focus:border-brand-400 transition-colors placeholder:text-ink-400"
              placeholder="Search..."
              [(ngModel)]="query"
            />
          </div>
          <span class="text-xs font-semibold text-ink-400 bg-surface-subtle rounded-full px-2.5 py-1 whitespace-nowrap hidden xs:inline-block">{{ filteredRows().length }} of {{ rows.length }}</span>
        </div>
        @if (exportable) {
          <button
            (click)="exportCsv()"
            class="group flex items-center gap-2 text-xs font-semibold text-brand-700 bg-brand-50 border border-brand-100 hover:bg-brand-100 hover:border-brand-200 active:scale-[0.97] rounded-lg pl-2.5 pr-3.5 py-2 transition-all shrink-0"
          >
            <span class="w-5 h-5 rounded-md bg-white/70 group-hover:bg-white flex items-center justify-center shrink-0 transition-colors">
              <mat-icon class="!text-[15px] !w-[15px] !h-[15px] !leading-[15px]">file_download</mat-icon>
            </span>
            <span class="hidden sm:inline">Export CSV</span>
          </button>
        }
      </div>

      @if (filteredRows().length === 0) {
        <app-empty-state [title]="emptyTitle" [description]="emptyDescription"></app-empty-state>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-surface-subtle text-left text-[11px] text-ink-500 uppercase tracking-wider">
                @for (col of columns; track col.key) {
                  <th
                    class="px-4 py-3 font-bold cursor-pointer select-none whitespace-nowrap hover:text-brand-600"
                    [class.text-right]="col.align === 'right'"
                    (click)="sortBy(col.key)"
                  >
                    {{ col.label }}
                    @if (sortKey() === col.key) {
                      <mat-icon class="!text-sm align-middle !text-brand-600">{{ sortDir() === 'asc' ? 'arrow_upward' : 'arrow_downward' }}</mat-icon>
                    }
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of pagedRows(); track $index) {
                <tr
                  class="border-t border-surface-border hover:bg-surface-subtle transition-colors"
                  [class.cursor-pointer]="rowClick.observed"
                  (click)="rowClick.emit(row)"
                >
                  @for (col of columns; track col.key) {
                    <td class="px-4 py-3 whitespace-nowrap text-ink-700" [class.text-right]="col.align === 'right'">
                      @if (col.type === 'status' && col.statusFn) {
                        <app-status-chip [label]="col.statusFn(row).label" [level]="col.statusFn(row).level"></app-status-chip>
                      } @else if (col.type === 'currency') {
                        <span class="font-semibold text-ink-900">{{ row[col.key] | number: '1.0-2' }}</span> <span class="text-ink-400 text-xs">{{ col.currency || 'OMR' }}</span>
                      } @else if (col.type === 'number') {
                        {{ row[col.key] | number }}
                      } @else {
                        {{ row[col.key] }}
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between p-3.5 text-xs font-medium text-ink-400">
          <span>Page {{ page() + 1 }} of {{ totalPages() }}</span>
          <div class="flex gap-1">
            <button mat-icon-button [disabled]="page() === 0" (click)="page.set(page() - 1)">
              <mat-icon>chevron_left</mat-icon>
            </button>
            <button mat-icon-button [disabled]="page() >= totalPages() - 1" (click)="page.set(page() + 1)">
              <mat-icon>chevron_right</mat-icon>
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class DataTableComponent<T extends Record<string, any> = any> {
  @Input() columns: TableColumn<T>[] = [];
  @Input() rows: T[] = [];
  @Input() pageSize = 8;
  @Input() exportable = true;
  @Input() emptyTitle = 'No records found';
  @Input() emptyDescription = 'Try adjusting your search or check back after the next sync.';
  @Output() rowClick = new EventEmitter<T>();

  query = '';
  sortKey = signal<string | null>(null);
  sortDir = signal<'asc' | 'desc'>('asc');
  page = signal(0);

  filteredRows = computed(() => {
    const q = this.query.trim().toLowerCase();
    let data = !q
      ? this.rows
      : this.rows.filter((row) => this.columns.some((c) => String(row[c.key] ?? '').toLowerCase().includes(q)));

    const key = this.sortKey();
    if (key) {
      const dir = this.sortDir() === 'asc' ? 1 : -1;
      data = [...data].sort((a, b) => (a[key] > b[key] ? dir : a[key] < b[key] ? -dir : 0));
    }
    return data;
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredRows().length / this.pageSize)));

  pagedRows = computed(() => {
    const start = this.page() * this.pageSize;
    return this.filteredRows().slice(start, start + this.pageSize);
  });

  sortBy(key: string) {
    if (this.sortKey() === key) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortKey.set(key);
      this.sortDir.set('asc');
    }
  }

  exportCsv() {
    const header = this.columns.map((c) => c.label).join(',');
    const lines = this.filteredRows().map((row) => this.columns.map((c) => JSON.stringify(row[c.key] ?? '')).join(','));
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
}
