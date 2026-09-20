import { Component, Input, Output, EventEmitter, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { StatusChipComponent } from '../status-chip/status-chip.component';
import { StatusLevel } from '../../../core/models/status';
import { EmptyStateComponent } from '../empty-state/empty-state.component';
import { UiService } from '../../services/ui.service';

export interface TableColumn<T = any> {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'currency' | 'money' | 'date' | 'status';
  decimals?: number;
  currency?: string;
  statusFn?: (row: T) => { label: string; level: StatusLevel };
  align?: 'left' | 'right';
  /** Renders buttons in the cell instead of a value; clicks come out of (rowAction). */
  actions?: Array<{ id: string; label: string; icon?: string; hide?: (row: T) => boolean }>;
}

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, MatMenuModule, StatusChipComponent, EmptyStateComponent],
  template: `
    <div class="surface-card overflow-hidden">
      @if (title) {
        <h3 class="px-4 pt-3.5 text-[13.5px] font-bold text-ink-900">{{ title }}</h3>
      }
      <div class="flex items-center justify-between gap-3 p-3.5 border-b border-surface-border flex-wrap">
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <div class="relative w-full max-w-[260px]">
            <mat-icon class="!text-ink-400 !text-lg absolute left-2.5 top-1/2 -translate-y-1/2">search</mat-icon>
            <input
              class="pl-9 pr-3 py-2 text-sm rounded-lg border border-surface-border w-full focus:outline-none focus:border-brand-400 transition-colors placeholder:text-ink-400"
              placeholder="Search..."
              [ngModel]="query()" (ngModelChange)="setQuery($event)"
            />
          </div>
          <span class="text-xs font-semibold text-ink-400 bg-surface-subtle rounded-full px-2.5 py-1 whitespace-nowrap hidden xs:inline-block">{{ filteredRows().length }} of {{ rows.length }}</span>
        </div>
        <div class="flex items-center gap-2 flex-wrap"><ng-content select="[toolbar]"></ng-content></div>
        @if (exportable) {
          <button type="button" [matMenuTriggerFor]="exportMenu" class="group flex items-center gap-2 text-xs font-semibold text-brand-700 bg-brand-50 border border-brand-100 hover:bg-brand-100 hover:border-brand-200 active:scale-[0.97] rounded-lg pl-2.5 pr-2 py-2 transition-all shrink-0">
            <span class="w-5 h-5 rounded-md bg-white/70 group-hover:bg-white flex items-center justify-center shrink-0 transition-colors">
              <mat-icon class="!text-[15px] !w-[15px] !h-[15px] !leading-[15px]">file_download</mat-icon>
            </span>
            <span class="hidden sm:inline">Export</span>
            <mat-icon class="!text-[18px] !w-[18px] !h-[18px] !leading-[18px] text-brand-500">expand_more</mat-icon>
          </button>
<mat-menu #exportMenu="matMenu" xPosition="before" class="app-menu-panel">
            <div class="w-56 py-1.5">
              <div class="px-4 pt-1.5 pb-1 text-[10.5px] font-bold uppercase tracking-wider text-ink-400">Export {{ filteredRows().length }} row{{ filteredRows().length === 1 ? '' : 's' }}</div>
              <button (click)="exportCsv()" class="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-ink-700 hover:bg-surface-subtle transition-colors">
                <mat-icon class="!text-lg !text-ink-400">file_download</mat-icon>CSV file (.csv)
              </button>
              <button (click)="exportXlsx()" class="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-ink-700 hover:bg-surface-subtle transition-colors">
                <mat-icon class="!text-lg !text-ink-400">table_view</mat-icon>Excel workbook (.xlsx)
              </button>
            </div>
          </mat-menu>
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
                      @if (col.actions) {
                        <div class="flex items-center gap-1">
                          @for (a of col.actions; track a.id) {
                            @if (!a.hide || !a.hide(row)) {
                              <button type="button" class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-brand-700 hover:bg-brand-50 transition-colors" (click)="$event.stopPropagation(); rowAction.emit({ row: row, id: a.id })">
                                @if (a.icon) { <mat-icon class="!text-[15px] !w-[15px] !h-[15px] !leading-[15px]">{{ a.icon }}</mat-icon> }{{ a.label }}
                              </button>
                            }
                          }
                        </div>
                      } @else if (col.type === 'status' && col.statusFn) {
                        <app-status-chip [label]="col.statusFn(row).label" [level]="col.statusFn(row).level"></app-status-chip>
                      } @else if (col.type === 'currency') {
                        <span class="font-semibold text-ink-900">{{ row[col.key] | number: '1.0-2' }}</span> <span class="text-ink-400 text-xs">{{ col.currency || 'OMR' }}</span>
                      } @else if (col.type === 'date') {
                        {{ fmtDate(row[col.key]) }}
                      } @else if (col.type === 'money') {
                        {{ row[col.key] | number: moneyFormat(col) }}
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
  @Input() title = '';
  private _columns = signal<TableColumn<T>[]>([]);
  private _rows = signal<T[]>([], { equal: (a, b) => a.length === b.length && a.every((x, i) => x === b[i]) });
  private _pageSize = signal(8);
  @Input() set columns(v: TableColumn<T>[]) { this._columns.set(v ?? []); }
  get columns() { return this._columns(); }
  @Input() set rows(v: T[]) { this._rows.set(v ?? []); }
  get rows() { return this._rows(); }
  @Input() set pageSize(v: number) { this._pageSize.set(v); }
  get pageSize() { return this._pageSize(); }
  @Input() exportable = true;
  @Input() emptyTitle = 'No records found';
  @Input() emptyDescription = 'Try adjusting your search or check back after the next sync.';
  @Output() rowClick = new EventEmitter<T>();
  @Output() rowAction = new EventEmitter<{ row: T; id: string }>();
  /** Extra row fields the search box also looks in (e.g. a PO number that is not a visible column). */
  @Input() searchKeys: string[] = [];
  private ui = inject(UiService);

  query = signal('');

  setQuery(v: string) {
    this.query.set(v);
    this.page.set(0);
  }
  sortKey = signal<string | null>(null);
  sortDir = signal<'asc' | 'desc'>('asc');
  page = signal(0);

  filteredRows = computed(() => {
    const q = this.query().trim().toLowerCase();
    const rows = this._rows();
    const cols = this._columns();
    let data = !q
      ? rows
      : rows.filter((row) => cols.some((c) => String(row[c.key] ?? '').toLowerCase().includes(q)) || this.searchKeys.some((k) => String(row[k] ?? '').toLowerCase().includes(q)));

    const key = this.sortKey();
    if (key) {
      const dir = this.sortDir() === 'asc' ? 1 : -1;
      data = [...data].sort((a, b) => (a[key] > b[key] ? dir : a[key] < b[key] ? -dir : 0));
    }
    return data;
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredRows().length / this._pageSize())));

  pagedRows = computed(() => {
    const start = this.page() * this._pageSize();
    return this.filteredRows().slice(start, start + this._pageSize());
  });

  moneyFormat(col: TableColumn): string {
    const d = col.decimals ?? 3;
    return '1.' + d + '-' + d;
  }

  fmtDate(v: unknown): string {
    const s = String(v ?? '');
    if (!s.includes('T')) return s;
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  }

  sortBy(key: string) {
    if (this.sortKey() === key) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortKey.set(key);
      this.sortDir.set('asc');
    }
  }

  private exportRows(): Array<Record<string, any>> {
    return this.filteredRows().map((row) => {
      const out: Record<string, any> = {};
      for (const c of this.columns.filter((x) => !x.actions)) out[c.label] = c.type === 'status' && c.statusFn ? c.statusFn(row).label : c.type === 'date' ? this.fmtDate(row[c.key]) : row[c.key] ?? '';
      return out;
    });
  }

  private exportName() {
    return (this.title || 'export').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  exportCsv() {
    this.ui.csv(this.exportName(), this.exportRows());
  }

  exportXlsx() {
    this.ui.xlsx(this.exportName(), this.exportRows(), this.title || 'Export');
  }
}
