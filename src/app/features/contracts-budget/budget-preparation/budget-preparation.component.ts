import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { ProjectRequests } from '../../../core/services/project-requests.service';
import { UiService } from '../../../shared/services/ui.service';
import { BudgetAddition, BudgetLine } from '../../../core/models/domain';
import { RequiresDirective } from '../../../shared/directives/requires.directive';

const CATEGORIES: BudgetLine['category'][] = ['Outsourcing', 'OJT', 'Petty Cash', 'Projects'];
const LAYERS = ['No PO layer', 'PO1', 'PO2', 'PO3 - Outsource'];

interface PrepLine {
  id: string;
  item: string;
  category: string;
  poLayer?: string;
  source: 'Auto +3%' | 'Manual' | 'Project request';
  note?: string;
  prior: number | null;
  draft: number;
  addition?: BudgetAddition;
}

@Component({
  selector: 'app-budget-preparation',
  standalone: true,
  imports: [RequiresDirective, CommonModule, RouterModule, FormsModule, MatButtonModule, MatIconModule, PageHeaderComponent, KpiCardComponent],
  template: `
    <app-page-header
      title="Budget Preparation"
      subtitle="Start from the draft at 3% above the prior approved budget, add lines by hand, and bring in the projects that were kept"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Budget' }, { label: 'Preparation' }]"
    >
      <span class="status-chip" [class]="chip()">{{ plan().status }}</span>
      @if (editable()) {
        <button mat-stroked-button (click)="addLine()" appRequires="Prepare/Edit Draft Budget"><mat-icon class="!text-base !mr-1">add</mat-icon>Add budget line</button>
        <button mat-stroked-button (click)="regenerate()" appRequires="Prepare/Edit Draft Budget"><mat-icon class="!text-base !mr-1">autorenew</mat-icon>Regenerate (+3%)</button>
        <button mat-flat-button color="primary" (click)="submit()" appRequires="Prepare/Edit Draft Budget"><mat-icon class="!text-base !mr-1">send</mat-icon>Submit for Approval</button>
      }
      @if (plan().status === 'Submitted') {
        <button mat-stroked-button color="warn" (click)="decide(false)" appRequires="Approve Budget"><mat-icon class="!text-base !mr-1">close</mat-icon>Reject</button>
        <button mat-flat-button color="primary" (click)="decide(true)" appRequires="Approve Budget"><mat-icon class="!text-base !mr-1">check</mat-icon>Approve</button>
      }
      @if (plan().status === 'Approved' || plan().status === 'Rejected') {
        <button mat-stroked-button (click)="reopen()" appRequires="Prepare/Edit Draft Budget"><mat-icon class="!text-base !mr-1">edit</mat-icon>Start a new draft</button>
      }
    </app-page-header>

    @if (plan().status === 'Submitted') {
      <div class="status-chip status-chip--amber mb-4">Submitted {{ plan().submittedAt | date:'medium' }} — waiting for the Budget Owner to approve or reject.</div>
    } @else if (plan().status === 'Approved') {
      <div class="status-chip status-chip--normal mb-4">Approved {{ plan().decidedAt | date:'medium' }}{{ plan().decisionNote ? ' — ' + plan().decisionNote : '' }}</div>
    } @else if (plan().status === 'Rejected') {
      <div class="status-chip status-chip--red mb-4">Rejected {{ plan().decidedAt | date:'medium' }}{{ plan().decisionNote ? ' — ' + plan().decisionNote : '' }}</div>
    }

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      <app-kpi-card label="Prior approved budget" [value]="priorTotal() | number:'1.0-0'" unit="OMR" icon="history"></app-kpi-card>
      <app-kpi-card label="Next-year draft" [value]="draftTotal() | number:'1.0-0'" unit="OMR" icon="edit_note"></app-kpi-card>
      <app-kpi-card label="Change" [value]="pct(priorTotal(), draftTotal())" icon="trending_up"></app-kpi-card>
      <app-kpi-card label="Added on top (manual + projects)" [value]="addedTotal() | number:'1.0-0'" unit="OMR" icon="playlist_add"></app-kpi-card>
    </div>

    @if (projects.waiting().length) {
      <a routerLink="/contracts-budget/projects" class="surface-card flex items-center gap-3 px-4 py-3 mb-4 hover:border-brand-300 transition-colors">
        <mat-icon class="text-status-amber">rocket_launch</mat-icon>
        <div class="flex-1 text-sm text-ink-700"><b>{{ projects.waiting().length }} project request{{ projects.waiting().length === 1 ? '' : 's' }}</b> are waiting for a decision. Kept projects appear here as budget lines.</div>
        <mat-icon class="text-ink-400">chevron_right</mat-icon>
      </a>
    }

    <div class="surface-card overflow-x-auto">
      <table class="crc-table w-full">
        <thead>
          <tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide">
            <th class="px-4 py-2.5 font-medium">Item</th>
            <th class="px-4 py-2.5 font-medium">Category</th>
            <th class="px-4 py-2.5 font-medium">PO Layer</th>
            <th class="px-4 py-2.5 font-medium">Source</th>
            <th class="px-4 py-2.5 font-medium text-right">Prior Budget (OMR)</th>
            <th class="px-4 py-2.5 font-medium text-right">Draft Budget (OMR)</th>
            <th class="px-4 py-2.5 font-medium text-right">Change</th>
            <th class="px-4 py-2.5 font-medium w-20"></th>
          </tr>
        </thead>
        <tbody>
          @for (line of lines(); track line.id) {
            <tr class="border-t border-surface-border">
              <td class="px-4 py-2 font-medium text-ink-700">{{ line.item }}@if (line.note) { <div class="text-xs font-normal text-ink-400 max-w-[320px] truncate" [title]="line.note">{{ line.note }}</div> }</td>
              <td class="px-4 py-2 text-ink-500">{{ line.category }}</td>
              <td class="px-4 py-2 text-ink-500">{{ line.poLayer || '—' }}</td>
              <td class="px-4 py-2"><span class="status-chip" [class]="line.source === 'Auto +3%' ? 'status-chip--neutral' : line.source === 'Manual' ? 'status-chip--info' : 'status-chip--orange'">{{ line.source }}</span></td>
              <td class="px-4 py-2 text-right text-ink-500">{{ line.prior === null ? '—' : (line.prior | number:'1.0-0') }}</td>
              <td class="px-4 py-2 text-right">
                <input
                  type="number"
                  class="w-28 text-right border border-surface-border rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand-400 transition-colors disabled:bg-surface-subtle disabled:text-ink-500"
                  [ngModel]="line.draft"
                  (ngModelChange)="setDraft(line.id, $event)"
                  [disabled]="!editable() || line.source === 'Project request'"
                  [title]="line.source === 'Project request' ? 'This amount comes from the project request' : ''"
                />
              </td>
              <td class="px-4 py-2 text-right text-xs font-semibold" [class]="line.prior === null ? 'text-status-info' : line.draft >= line.prior ? 'text-status-amber' : 'text-status-normal'">{{ line.prior === null ? 'New' : pct(line.prior, line.draft) }}</td>
              <td class="px-4 py-2 text-right whitespace-nowrap">
                @if (line.source === 'Manual' && editable()) {
                  <button class="w-7 h-7 rounded-md inline-flex items-center justify-center text-ink-400 hover:bg-surface-subtle hover:text-brand-600" title="Edit line" (click)="editLine(line.addition!)"><mat-icon class="!text-[17px]">edit</mat-icon></button>
                  <button class="w-7 h-7 rounded-md inline-flex items-center justify-center text-ink-400 hover:bg-red-50 hover:text-status-red" title="Remove line" (click)="removeLine(line.addition!)"><mat-icon class="!text-[17px]">delete_outline</mat-icon></button>
                } @else if (line.source === 'Project request') {
                  <a routerLink="/contracts-budget/projects" class="text-xs font-semibold text-brand-700 hover:underline">Project</a>
                }
              </td>
            </tr>
          }
        </tbody>
        <tfoot>
          <tr class="border-t-2 border-surface-border font-semibold">
            <td class="px-4 py-2.5" colspan="4">Total</td>
            <td class="px-4 py-2.5 text-right">{{ priorTotal() | number:'1.0-0' }}</td>
            <td class="px-4 py-2.5 text-right text-brand-700">{{ draftTotal() | number:'1.0-0' }}</td>
            <td class="px-4 py-2.5 text-right text-xs">{{ pct(priorTotal(), draftTotal()) }}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p class="text-xs text-ink-400 mt-3">The +3% draft and the lines you add by hand sit side by side; regenerating the draft never removes a manual or project line. Submitted budgets route to the Budget Owner; the approved figure is what the Budget Dashboard shows as next-year budget.</p>
  `,
})
export class BudgetPreparationComponent {
  private store = inject(CrcStore);
  private ui = inject(UiService);
  projects = inject(ProjectRequests);

  plan = this.store.budgetPlan;
  lines = computed<PrepLine[]>(() => {
    const drafts = this.plan().drafts;
    const auto: PrepLine[] = this.store.budgetLines().map((l) => ({ id: l.id, item: l.item, category: l.category, poLayer: l.poLayer, source: 'Auto +3%', prior: l.allocated, draft: drafts[l.id] ?? Math.round(l.allocated * 1.03) }));
    const added: PrepLine[] = this.store.budgetAdditions().map((a) => ({ id: a.id, item: a.item, category: a.category, poLayer: a.poLayer, source: a.source, note: a.note, prior: null, draft: drafts[a.id] ?? a.amount, addition: a }));
    return [...auto, ...added];
  });
  editable = computed(() => this.plan().status === 'Draft' && this.store.can('Prepare/Edit Draft Budget'));
  priorTotal = computed(() => this.lines().reduce((s, l) => s + (l.prior ?? 0), 0));
  draftTotal = computed(() => this.lines().reduce((s, l) => s + Number(l.draft || 0), 0));
  addedTotal = computed(() => this.lines().filter((l) => l.prior === null).reduce((s, l) => s + Number(l.draft || 0), 0));
  chip = computed(() => ({ Draft: 'status-chip--neutral', Submitted: 'status-chip--amber', Approved: 'status-chip--normal', Rejected: 'status-chip--red' })[this.plan().status]);

  pct(from: number, to: number) {
    if (!from) return '—';
    const p = ((to - from) / from) * 100;
    return `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`;
  }

  setDraft(id: string, v: number) {
    this.store.setDraft(id, Number(v) || 0);
  }

  async addLine(existing?: BudgetAddition) {
    if (!this.ui.requires('Prepare/Edit Draft Budget')) return;
    const v = await this.ui.form({
      title: existing ? 'Edit budget line' : 'Add a budget line', subtitle: 'A line typed in by hand, next to the auto-drafted ones', icon: 'playlist_add', submitLabel: existing ? 'Save line' : 'Add line',
      values: existing ? { ...existing, poLayer: existing.poLayer ?? 'No PO layer' } : { category: 'Outsourcing', poLayer: 'No PO layer' },
      fields: [
        { key: 'item', label: 'Item', required: true, placeholder: 'e.g. Extra headsets for the Sohar centre' },
        { key: 'category', label: 'Category', type: 'select', options: CATEGORIES, required: true },
        { key: 'poLayer', label: 'PO layer', type: 'select', options: LAYERS },
        { key: 'amount', label: 'Next-year amount (OMR)', type: 'number', min: 0, required: true },
        { key: 'note', label: 'Note (optional)', type: 'textarea', placeholder: 'What is it for?' },
      ],
    });
    if (!v) return;
    const data = { category: v['category'], item: v['item'], poLayer: v['poLayer'] === 'No PO layer' ? undefined : v['poLayer'], amount: Number(v['amount']), note: v['note'] || undefined };
    if (existing) { this.store.updateBudgetAddition(existing.id, data); this.store.setDraft(existing.id, data.amount); this.ui.toast('Budget line updated.'); }
    else { this.store.addBudgetAddition({ ...data, source: 'Manual' }); this.ui.toast('Budget line added to the draft.'); }
  }

  editLine(a: BudgetAddition) {
    return this.addLine(a);
  }

  async removeLine(a: BudgetAddition) {
    const ok = await this.ui.confirm({ title: 'Remove this budget line?', message: `${a.item} (${a.amount.toLocaleString()} OMR) will be taken out of the next-year draft.`, confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    this.store.removeBudgetAddition(a.id);
    this.ui.toast('Budget line removed.');
  }

  regenerate() {
    if (!this.ui.requires('Prepare/Edit Draft Budget')) return;
    this.store.regenerateDraft();
    this.ui.toast('Draft regenerated at 3% above the prior approved budget. Manual and project lines were kept.');
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
