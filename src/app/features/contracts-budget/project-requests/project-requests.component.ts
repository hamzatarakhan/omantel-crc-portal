import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { RequiresDirective } from '../../../shared/directives/requires.directive';
import { CrcStore } from '../../../core/services/crc-store.service';
import { ProjectRequests } from '../../../core/services/project-requests.service';
import { UiService } from '../../../shared/services/ui.service';
import { DIALOG_SIZE } from '../../../shared/dialog-sizes';
import { ProjectRequest } from '../../../core/services/project-data';
import { PROJECT_LEVEL, ProjectDetailDialogComponent } from './project-detail-dialog.component';

const FILTERS = ['Active', 'Draft', 'Submitted', 'Kept', 'Sent back', 'Removed'];

@Component({
  selector: 'app-project-requests',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule, PageHeaderComponent, KpiCardComponent, DataTableComponent, RequiresDirective],
  template: `
    <app-page-header
      title="Project Requests"
      [subtitle]="store.can('Approve Projects') ? 'Projects proposed by team leads and line managers — keep them, send them back for changes, or remove them' : 'Add the projects you need, the budget for each and why — then submit them for a decision'"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Budget' }, { label: 'Project Requests' }]"
    >
      <button mat-flat-button color="primary" (click)="form()" appRequires="Submit Project Requests"><mat-icon class="!text-base !mr-1">add</mat-icon>New project</button>
    </app-page-header>

    @if (store.can('Approve Projects') && svc.waiting().length) {
      <div class="surface-card px-4 py-3 mb-4 flex items-center gap-3 border-l-4 !border-l-status-amber">
        <mat-icon class="text-status-amber">pending_actions</mat-icon>
        <div class="flex-1 text-sm text-ink-700"><b>{{ svc.waiting().length }} project{{ svc.waiting().length === 1 ? '' : 's' }}</b> waiting for your decision, {{ waitingBudget() | number:'1.0-0' }} OMR in total.</div>
        <button mat-stroked-button (click)="filter.set('Submitted')">Show them</button>
      </div>
    } @else if (returned().length && store.can('Submit Project Requests')) {
      <div class="surface-card px-4 py-3 mb-4 flex items-center gap-3 border-l-4 !border-l-status-orange">
        <mat-icon class="text-status-orange">undo</mat-icon>
        <div class="flex-1 text-sm text-ink-700"><b>{{ returned().length }} project{{ returned().length === 1 ? ' was' : 's were' }} sent back</b> with a note. Edit and submit again.</div>
        <button mat-stroked-button (click)="filter.set('Sent back')">Show them</button>
      </div>
    }

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <app-kpi-card label="Waiting for a decision" [value]="svc.waiting().length" level="amber" icon="pending_actions"></app-kpi-card>
      <app-kpi-card label="Kept" [value]="svc.kept().length" level="normal" icon="check_circle"></app-kpi-card>
      <app-kpi-card label="Budget kept" [value]="svc.keptBudget() | number:'1.0-0'" unit="OMR" icon="payments"></app-kpi-card>
      <app-kpi-card label="Sent back" [value]="returned().length" [level]="returned().length ? 'orange' : 'neutral'" icon="undo"></app-kpi-card>
    </div>

    <app-data-table title="Projects" [columns]="columns" [rows]="rows()" [pageSize]="8" [exportable]="store.can('Export Contract Data')" [searchKeys]="['reason']" (rowClick)="open($event)" (rowAction)="act($event)" emptyTitle="No projects here" emptyDescription="Add a project with the budget it needs and why, then submit it for a decision.">
      <div toolbar class="flex items-center gap-1 bg-surface-subtle border border-surface-border rounded-lg p-0.5 flex-wrap">
        @for (f of filters; track f) {
          <button (click)="filter.set(f)" class="px-2.5 py-1 text-xs font-semibold rounded-md transition-colors" [class]="filter() === f ? 'bg-white text-brand-700 border border-surface-border' : 'text-ink-500 hover:text-ink-900 border border-transparent'">{{ f }}</button>
        }
      </div>
    </app-data-table>
    <p class="text-xs text-ink-400 mt-3">Kept projects are added to next year's budget on <a class="text-brand-600 font-medium" routerLink="/contracts-budget/budget-preparation">Budget Preparation</a>. Removed projects stay in the history with who removed them and why. Contract, PO and dates are optional — a project can start before a contract exists.</p>
  `,
})
export class ProjectRequestsComponent {
  store = inject(CrcStore);
  svc = inject(ProjectRequests);
  private ui = inject(UiService);
  private dialog = inject(MatDialog);

  filters = FILTERS;
  filter = signal('Active');

  returned = computed(() => this.svc.projects().filter((p) => p.status === 'Sent back'));
  waitingBudget = computed(() => this.svc.waiting().reduce((s, p) => s + p.budget, 0));
  rows = computed(() => this.svc.projects()
    .filter((p) => (this.filter() === 'Active' ? p.status !== 'Removed' : p.status === this.filter()))
    .map((p) => ({ ...p, note: p.decisionNote ?? '' })));

  private mine = (r: ProjectRequest) => (r.status === 'Draft' || r.status === 'Sent back') && this.store.can('Submit Project Requests');
  private decide = (r: ProjectRequest) => r.status === 'Submitted' && this.store.can('Approve Projects');

  columns: TableColumn<any>[] = [
    { key: 'name', label: 'Project' },
    { key: 'scope', label: 'Scope of work' },
    { key: 'contractRef', label: 'Contract' },
    { key: 'poNumber', label: 'PO' },
    { key: 'from', label: 'From', type: 'date' },
    { key: 'to', label: 'To', type: 'date' },
    { key: 'budget', label: 'Budget needed', type: 'currency', align: 'right' },
    { key: 'status', label: 'Status', type: 'status', statusFn: (r) => ({ label: r.status, level: PROJECT_LEVEL[r.status] }) },
    { key: 'requestedBy', label: 'Requested by' },
    { key: 'note', label: 'Decision note' },
    {
      key: 'do', label: 'Actions',
      actions: [
        { id: 'edit', label: 'Edit', icon: 'edit', hide: (r) => !this.mine(r) },
        { id: 'submit', label: 'Submit', icon: 'send', hide: (r) => !this.mine(r) },
        { id: 'keep', label: 'Keep', icon: 'check_circle', hide: (r) => !this.decide(r) },
        { id: 'back', label: 'Send back', icon: 'undo', hide: (r) => !this.decide(r) },
        { id: 'remove', label: 'Remove', icon: 'delete_outline', hide: (r) => !(this.mine(r) || this.decide(r) || (r.status === 'Kept' && this.store.can('Approve Projects'))) },
      ],
    },
  ];

  open(p: ProjectRequest) {
    const fresh = this.svc.projects().find((x) => x.id === p.id) ?? p;
    this.dialog.open(ProjectDetailDialogComponent, { data: { project: fresh }, panelClass: 'app-dialog-panel', autoFocus: false, ...DIALOG_SIZE.form });
  }

  async form(p?: ProjectRequest) {
    if (!this.ui.requires('Submit Project Requests')) return;
    const v = await this.ui.form({
      title: p ? 'Edit project' : 'New project', subtitle: p ? 'Change what you need, then submit it again' : 'Describe the project, the budget you need and why', icon: 'rocket_launch', submitLabel: p ? 'Save changes' : 'Add project',
      values: p ? { ...p } : {},
      fields: [
        { key: 'name', label: 'Project name or supplier', required: true, placeholder: 'e.g. Speech analytics for call quality' },
        { key: 'scope', label: 'Scope of work', type: 'textarea', required: true, placeholder: 'What will be delivered?' },
        { key: 'budget', label: 'Budget needed (OMR)', type: 'number', min: 1, required: true },
        { key: 'contractRef', label: 'Contract reference', placeholder: 'Leave empty if there is none yet', hint: 'Can be "Still under RFT".' },
        { key: 'poNumber', label: 'PO number', placeholder: 'Leave empty if there is none yet' },
        { key: 'from', label: 'From', type: 'date' },
        { key: 'to', label: 'To', type: 'date' },
        { key: 'reason', label: 'Why is this project needed?', type: 'textarea', required: true, hint: 'The Budget Owner decides based on this.' },
      ],
    });
    if (!v) return;
    const data = { name: v['name'], scope: v['scope'], budget: Number(v['budget']), contractRef: v['contractRef'] || undefined, poNumber: v['poNumber'] || undefined, from: v['from'] || undefined, to: v['to'] || undefined, reason: v['reason'] };
    if (p) { this.svc.edit(p.id, data); this.ui.toast('Project updated.'); }
    else { this.svc.create(data); this.ui.toast('Project added as a draft. Submit it when it is ready.'); }
  }

  async act(e: { row: any; id: string }) {
    const p = this.svc.projects().find((x) => x.id === e.row.id);
    if (!p) return;
    if (e.id === 'edit') return this.form(p);
    if (e.id === 'submit') {
      if (!this.ui.requires('Submit Project Requests')) return;
      this.svc.submit(p.id);
      this.ui.toast('Submitted — the Budget Owner has been notified.');
      return;
    }
    if (e.id === 'keep') {
      if (!this.ui.requires('Approve Projects')) return;
      const v = await this.ui.form({ title: 'Keep this project', subtitle: `${p.name} · ${p.budget.toLocaleString()} OMR will be added to next year's budget`, icon: 'check_circle', submitLabel: 'Keep', fields: [{ key: 'note', label: 'Comment (optional)', type: 'textarea' }] });
      if (!v) return;
      this.svc.keep(p.id, v['note'] ?? '');
      this.ui.toast('Project kept and added to next year\'s budget.');
      return;
    }
    if (e.id === 'back') {
      if (!this.ui.requires('Approve Projects')) return;
      const v = await this.ui.form({ title: 'Send back for changes', subtitle: `${p.name} returns to ${p.requestedBy}`, icon: 'undo', submitLabel: 'Send back', fields: [{ key: 'note', label: 'What needs to change?', type: 'textarea', required: true }] });
      if (!v) return;
      this.svc.sendBack(p.id, v['note']);
      this.ui.toast('Sent back to the requester.');
      return;
    }
    if (e.id === 'remove') {
      const allowed = this.store.can('Approve Projects') || this.store.can('Submit Project Requests');
      if (!allowed) { this.ui.requires('Approve Projects'); return; }
      const wasKept = p.status === 'Kept';
      const v = await this.ui.form({ title: 'Remove this project', subtitle: wasKept ? `${p.name} — its ${p.budget.toLocaleString()} OMR is taken out of next year's budget` : p.name, icon: 'delete_outline', submitLabel: 'Remove', fields: [{ key: 'note', label: 'Reason', type: 'textarea', required: true, hint: 'Removed projects stay in the history.' }] });
      if (!v) return;
      this.svc.remove(p.id, v['note']);
      this.ui.toast('Project removed. It stays in the history under "Removed".');
    }
  }
}
