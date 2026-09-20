import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';

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
      <span class="status-chip" [class]="chip()">{{ plan().status }}</span>
      @if (editable()) {
        <button mat-stroked-button (click)="regenerate()"><mat-icon class="!text-base !mr-1">autorenew</mat-icon>Regenerate Draft (+3%)</button>
        <button mat-flat-button color="primary" (click)="submit()"><mat-icon class="!text-base !mr-1">send</mat-icon>Submit for Approval</button>
      }
      @if (plan().status === 'Submitted') {
        <button mat-stroked-button color="warn" (click)="decide(false)"><mat-icon class="!text-base !mr-1">close</mat-icon>Reject</button>
        <button mat-flat-button color="primary" (click)="decide(true)"><mat-icon class="!text-base !mr-1">check</mat-icon>Approve</button>
      }
      @if (plan().status === 'Approved' || plan().status === 'Rejected') {
        <button mat-stroked-button (click)="reopen()"><mat-icon class="!text-base !mr-1">edit</mat-icon>Start a new draft</button>
      }
    </app-page-header>

    @if (plan().status === 'Submitted') {
      <div class="status-chip status-chip--amber mb-4">Submitted {{ plan().submittedAt | date:'medium' }} — waiting for the Budget Owner to approve or reject.</div>
    } @else if (plan().status === 'Approved') {
      <div class="status-chip status-chip--normal mb-4">Approved {{ plan().decidedAt | date:'medium' }}{{ plan().decisionNote ? ' — ' + plan().decisionNote : '' }}</div>
    } @else if (plan().status === 'Rejected') {
      <div class="status-chip status-chip--red mb-4">Rejected {{ plan().decidedAt | date:'medium' }}{{ plan().decisionNote ? ' — ' + plan().decisionNote : '' }}</div>
    }

    <div class="surface-card overflow-x-auto">
      <table class="crc-table w-full">
        <thead>
          <tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide">
            <th class="px-4 py-2.5 font-medium">Item</th>
            <th class="px-4 py-2.5 font-medium">Category</th>
            <th class="px-4 py-2.5 font-medium">PO Layer</th>
            <th class="px-4 py-2.5 font-medium text-right">Prior Budget (OMR)</th>
            <th class="px-4 py-2.5 font-medium text-right">Draft Budget (OMR)</th>
            <th class="px-4 py-2.5 font-medium text-right">Change</th>
          </tr>
        </thead>
        <tbody>
          @for (line of lines(); track line.id) {
            <tr class="border-t border-surface-border">
              <td class="px-4 py-2 font-medium text-ink-700">{{ line.item }}</td>
              <td class="px-4 py-2 text-ink-500">{{ line.category }}</td>
              <td class="px-4 py-2 text-ink-500">{{ line.poLayer || '—' }}</td>
              <td class="px-4 py-2 text-right text-ink-500">{{ line.allocated | number:'1.0-0' }}</td>
              <td class="px-4 py-2 text-right">
                <input
                  type="number"
                  class="w-28 text-right border border-surface-border rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand-400 transition-colors disabled:bg-surface-subtle disabled:text-ink-500"
                  [ngModel]="line.draft"
                  (ngModelChange)="setDraft(line.id, $event)"
                  [disabled]="!editable()"
                />
              </td>
              <td class="px-4 py-2 text-right text-xs font-semibold" [class]="line.draft >= line.allocated ? 'text-status-amber' : 'text-status-normal'">{{ pct(line.allocated, line.draft) }}</td>
            </tr>
          }
        </tbody>
        <tfoot>
          <tr class="border-t-2 border-surface-border font-semibold">
            <td class="px-4 py-2.5" colspan="3">Total</td>
            <td class="px-4 py-2.5 text-right">{{ priorTotal() | number:'1.0-0' }}</td>
            <td class="px-4 py-2.5 text-right text-brand-700">{{ draftTotal() | number:'1.0-0' }}</td>
            <td class="px-4 py-2.5 text-right text-xs">{{ pct(priorTotal(), draftTotal()) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p class="text-xs text-ink-400 mt-3">Draft values are editable per line before submission. Submitted budgets route to the Budget Owner for approval; the approved figure is what the Budget Dashboard shows as next-year budget.</p>
  `,
})
export class BudgetPreparationComponent {
  private store = inject(CrcStore);
  private ui = inject(UiService);

  plan = this.store.budgetPlan;
  lines = computed(() => this.store.budgetLines().map((l) => ({ ...l, draft: this.plan().drafts[l.id] ?? Math.round(l.allocated * 1.03) })));
  editable = computed(() => this.plan().status === 'Draft' && this.store.can('Prepare/Edit Draft Budget'));
  priorTotal = computed(() => this.lines().reduce((s, l) => s + l.allocated, 0));
  draftTotal = computed(() => this.lines().reduce((s, l) => s + Number(l.draft || 0), 0));
  chip = computed(() => ({ Draft: 'status-chip--neutral', Submitted: 'status-chip--amber', Approved: 'status-chip--normal', Rejected: 'status-chip--red' })[this.plan().status]);

  pct(from: number, to: number) {
    if (!from) return '—';
    const p = ((to - from) / from) * 100;
    return `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`;
  }

  setDraft(id: string, v: number) {
    this.store.setDraft(id, Number(v) || 0);
  }

  regenerate() {
    if (!this.ui.requires('Prepare/Edit Draft Budget')) return;
    this.store.regenerateDraft();
    this.ui.toast('Draft regenerated at 3% above the prior approved budget.');
  }

  async submit() {
    if (!this.ui.requires('Prepare/Edit Draft Budget')) return;
    const ok = await this.ui.confirm({ title: 'Submit budget for approval?', message: `Next-year budget of ${Math.round(this.draftTotal()).toLocaleString()} OMR will be locked and routed to the Budget Owner.`, confirmLabel: 'Submit', icon: 'send' });
    if (!ok) return;
    this.store.submitBudget();
    this.ui.toast('Budget submitted for approval — the Budget Owner has been notified.');
  }

  async decide(approved: boolean) {
    if (!this.ui.requires('Approve Budget')) return;
    const v = await this.ui.form({
      title: approved ? 'Approve the budget' : 'Reject the budget',
      subtitle: `${Math.round(this.draftTotal()).toLocaleString()} OMR next-year budget`,
      icon: approved ? 'task_alt' : 'block',
      submitLabel: approved ? 'Approve' : 'Reject',
      fields: [{ key: 'note', label: approved ? 'Comment (optional)' : 'Reason', type: 'textarea', required: !approved, placeholder: approved ? 'Approved as submitted' : 'What needs to change?' }],
    });
    if (!v) return;
    this.store.decideBudget(approved, v['note']);
    this.ui.toast(approved ? 'Budget approved.' : 'Budget rejected and returned to the preparer.');
  }

  reopen() {
    this.store.regenerateDraft();
    this.ui.toast('New draft started.');
  }
}
