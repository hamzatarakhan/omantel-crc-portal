import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { MockDataService } from '../../../core/services/mock-data.service';
import { BudgetLine } from '../../../core/models/domain';

@Component({
  selector: 'app-budget-preparation',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, PageHeaderComponent],
  template: `
    <app-page-header
      title="Budget Preparation"
      subtitle="Draft auto-suggested at 3% above the prior approved budget — adjust any line before submitting"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Budget Preparation' }]"
    >
      <button mat-stroked-button (click)="regenerate()"><mat-icon class="!text-base !mr-1">autorenew</mat-icon>Regenerate Draft (+3%)</button>
      <button mat-flat-button color="primary" (click)="submit()"><mat-icon class="!text-base !mr-1">send</mat-icon>Submit for Approval</button>
    </app-page-header>

    <div class="surface-card overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide">
            <th class="px-4 py-2.5 font-medium">Item</th>
            <th class="px-4 py-2.5 font-medium">Category</th>
            <th class="px-4 py-2.5 font-medium">PO Layer</th>
            <th class="px-4 py-2.5 font-medium text-right">Prior Budget (OMR)</th>
            <th class="px-4 py-2.5 font-medium text-right">Draft Budget (OMR)</th>
          </tr>
        </thead>
        <tbody>
          @for (line of draftLines(); track line.id) {
            <tr class="border-t border-surface-border">
              <td class="px-4 py-2 font-medium text-ink-700">{{ line.item }}</td>
              <td class="px-4 py-2 text-ink-500">{{ line.category }}</td>
              <td class="px-4 py-2 text-ink-500">{{ line.poLayer || '—' }}</td>
              <td class="px-4 py-2 text-right text-ink-500">{{ line.allocated | number:'1.0-0' }}</td>
              <td class="px-4 py-2 text-right">
                <input
                  type="number"
                  class="w-28 text-right border border-surface-border rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand-400 transition-colors"
                  [(ngModel)]="line.draft"
                />
              </td>
            </tr>
          }
        </tbody>
        <tfoot>
          <tr class="border-t-2 border-surface-border font-semibold">
            <td class="px-4 py-2.5" colspan="3">Total</td>
            <td class="px-4 py-2.5 text-right">{{ priorTotal() | number:'1.0-0' }}</td>
            <td class="px-4 py-2.5 text-right text-brand-700">{{ draftTotal() | number:'1.0-0' }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p class="text-xs text-ink-400 mt-3">Draft values are editable per line before submission. Submitted budgets route to the configured approver.</p>
  `,
})
export class BudgetPreparationComponent {
  private data = inject(MockDataService);
  private lines: BudgetLine[] = this.data.getBudgetLines().filter((l) => l.category !== 'Total Budget');
  draftLines = signal(this.lines.map((l) => ({ ...l, draft: Math.round(l.allocated * 1.03) })));

  priorTotal = computed(() => this.draftLines().reduce((s, l) => s + l.allocated, 0));
  draftTotal = computed(() => this.draftLines().reduce((s, l) => s + Number(l.draft || 0), 0));

  constructor(private snack: MatSnackBar) {}

  regenerate() {
    this.draftLines.set(this.lines.map((l) => ({ ...l, draft: Math.round(l.allocated * 1.03) })));
    this.snack.open('Draft regenerated at 3% above the prior approved budget.', 'Dismiss', { duration: 3000 });
  }

  submit() {
    this.snack.open('Budget submitted for approval.', 'Dismiss', { duration: 3000 });
  }
}
