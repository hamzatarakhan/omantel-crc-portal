import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { percentUsedToLevel } from '../../../core/models/status';

@Component({
  selector: 'app-budget-breakdown',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Budget Breakdown"
      subtitle="Spent amount per item against the approved budget"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Budget Breakdown' }]"
    ></app-page-header>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      @for (l of layers(); track l.layer) {
        <button
          (click)="layer.set(layer() === l.layer ? 'All' : l.layer)"
          class="surface-card px-4 py-3 text-left transition-colors hover:border-brand-300"
          [class.!border-brand-500]="layer() === l.layer"
        >
          <div class="text-[11px] font-bold text-ink-400 uppercase tracking-wide">{{ l.layer }}</div>
          <div class="text-lg font-extrabold text-ink-900 mt-0.5">{{ l.spent | number:'1.0-0' }} <span class="text-xs font-medium text-ink-400">/ {{ l.allocated | number:'1.0-0' }} OMR</span></div>
          <div class="h-1.5 rounded-full bg-surface-subtle mt-2 overflow-hidden">
            <div class="h-full rounded-full" [style.width.%]="min(l.pct, 100)" [style.background]="l.pct >= 90 ? '#e02424' : l.pct >= 75 ? '#e3a008' : '#0e9f6e'"></div>
          </div>
        </button>
      }
    </div>

    <app-data-table title="Budget lines" [columns]="columns" [rows]="rows()">
      <div toolbar class="flex items-center gap-1 bg-surface-subtle border border-surface-border rounded-lg p-0.5 flex-wrap">
        @for (c of categories(); track c) {
          <button
            (click)="category.set(c)"
            class="px-2.5 py-1 text-xs font-semibold rounded-md transition-colors"
            [class]="category() === c ? 'bg-white text-brand-700 border border-surface-border' : 'text-ink-500 hover:text-ink-900 border border-transparent'"
          >{{ c }}</button>
        }
      </div>
    </app-data-table>
    @if (layer() !== 'All') {
      <p class="text-xs text-ink-400 mt-3">Filtered to <strong>{{ layer() }}</strong>. Click the tile again to clear.</p>
    }
  `,
})
export class BudgetBreakdownComponent {
  private store = inject(CrcStore);

  category = signal('All');
  layer = signal('All');
  categories = computed(() => ['All', ...new Set(this.store.budgetLines().map((l) => l.category))]);

  layers = computed(() => {
    const map = new Map<string, { allocated: number; spent: number }>();
    for (const l of this.store.budgetLines().filter((x) => x.poLayer)) {
      const cur = map.get(l.poLayer!) ?? { allocated: 0, spent: 0 };
      map.set(l.poLayer!, { allocated: cur.allocated + l.allocated, spent: cur.spent + l.spent });
    }
    const out = [...map.entries()].map(([layer, v]) => ({ layer, ...v, pct: Math.round((v.spent / v.allocated) * 100) }));
    const rest = this.store.budgetLines().filter((x) => !x.poLayer);
    const a = rest.reduce((s, l) => s + l.allocated, 0);
    const sp = rest.reduce((s, l) => s + l.spent, 0);
    return [...out, { layer: 'Non-PO items', allocated: a, spent: sp, pct: Math.round((sp / a) * 100) }];
  });

  rows = computed(() =>
    this.store.budgetLines()
      .filter((l) => (this.category() === 'All' || l.category === this.category()) && (this.layer() === 'All' || (this.layer() === 'Non-PO items' ? !l.poLayer : l.poLayer === this.layer())))
      .map((l) => ({ ...l, poLayer: l.poLayer ?? '—', remaining: l.allocated - l.spent, pctUsed: Math.round((l.spent / l.allocated) * 100) })),
  );

  min(a: number, b: number) {
    return Math.min(a, b);
  }

  columns: TableColumn<any>[] = [
    { key: 'item', label: 'Item' },
    { key: 'category', label: 'Category' },
    { key: 'poLayer', label: 'PO Layer' },
    { key: 'allocated', label: 'Allocated', type: 'currency', align: 'right' },
    { key: 'spent', label: 'Spent', type: 'currency', align: 'right' },
    { key: 'remaining', label: 'Remaining', type: 'currency', align: 'right' },
    {
      key: 'pctUsed', label: '% Used', type: 'status', align: 'right',
      statusFn: (r) => ({ label: r.pctUsed + '%', level: percentUsedToLevel(r.pctUsed) }),
    },
  ];
}
