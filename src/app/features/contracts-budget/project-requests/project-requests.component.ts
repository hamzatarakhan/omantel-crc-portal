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
import { ProjectInput, ProjectRequests } from '../../../core/services/project-requests.service';
import { UiService } from '../../../shared/services/ui.service';
import { BudgetConfig } from '../../../core/services/budget-config.service';
import { BudgetCycle } from '../../../core/services/budget-cycle.service';
import { DIALOG_SIZE } from '../../../shared/dialog-sizes';
import { CURRENCIES, CURRENT_FY, ProjectRequest, SUBMISSION_STATUSES, projectTotal } from '../../../core/services/project-data';
import { PRIORITY_LEVEL, PROJECT_LEVEL, ProjectDetailDialogComponent } from './project-detail-dialog.component';

const FIELD = 'w-full px-2.5 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 focus:outline-none focus:border-brand-400';
const num = (v: any) => Number(v ?? 0) || 0;

@Component({
  selector: 'app-project-requests',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule, PageHeaderComponent, KpiCardComponent, DataTableComponent, RequiresDirective],
  template: `
    <app-page-header
      title="Project Requests"
      [subtitle]="store.can('Approve Projects') ? 'Projects proposed by line managers and project managers for the next budget — include them, return them for changes, or exclude them' : 'Add the projects you need for next year with the cost, priority, head count and why — then submit them for a decision'"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Budget' }, { label: 'Project Requests' }]"
    >
      <button mat-flat-button color="primary" (click)="form()" appRequires="Submit Project Requests"><mat-icon class="!text-base !mr-1">add</mat-icon>New project</button>
    </app-page-header>

    @if (store.can('Approve Projects') && svc.waiting().length) {
      <div class="surface-card px-4 py-3 mb-4 flex items-center gap-3 border-l-4 !border-l-status-amber">
        <mat-icon class="text-status-amber">pending_actions</mat-icon>
        <div class="flex-1 text-sm text-ink-700"><b>{{ svc.waiting().length }} project{{ svc.waiting().length === 1 ? '' : 's' }}</b> waiting for your decision, {{ waitingBudget() | number:'1.0-0' }} OMR in total.</div>
        <button mat-stroked-button (click)="showStatus('Submitted')">Show them</button>
      </div>
    } @else if (svc.returned().length && store.can('Submit Project Requests')) {
      <div class="surface-card px-4 py-3 mb-4 flex items-center gap-3 border-l-4 !border-l-status-orange">
        <mat-icon class="text-status-orange">undo</mat-icon>
        <div class="flex-1 text-sm text-ink-700"><b>{{ svc.returned().length }} project{{ svc.returned().length === 1 ? ' was' : 's were' }} returned</b> with a note. Edit and submit again.</div>
        <button mat-stroked-button (click)="showStatus('Returned for Modification')">Show them</button>
      </div>
    }

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      <app-kpi-card label="Waiting for a decision" [value]="svc.waiting().length" level="amber" icon="pending_actions"></app-kpi-card>
      <app-kpi-card label="Included in budget" [value]="svc.included().length" level="normal" icon="check_circle"></app-kpi-card>
      <app-kpi-card label="Included cost" [value]="svc.includedTotal() | number:'1.0-0'" unit="OMR" icon="payments"></app-kpi-card>
      <app-kpi-card label="Returned" [value]="svc.returned().length" [level]="svc.returned().length ? 'orange' : 'neutral'" icon="undo"></app-kpi-card>
    </div>

    <div class="surface-card px-4 py-3.5 mb-4">
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
        @for (f of selects(); track f.key) {
          <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">{{ f.label }}</span>
            <select [class]="field + ' mt-1'" [value]="f.value()" (change)="f.set($any($event.target).value)">
              @for (o of f.options; track o) { <option [value]="o" [selected]="o === f.value()">{{ o === 'All' ? f.all : o }}</option> }
            </select>
          </label>
        }
        <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Submitted from</span><input type="date" [class]="field + ' mt-1'" [value]="subFrom()" (change)="subFrom.set($any($event.target).value)"></label>
        <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Submitted to</span><input type="date" [class]="field + ' mt-1'" [value]="subTo()" (change)="subTo.set($any($event.target).value)"></label>
        <div class="flex items-end"><button (click)="clear()" class="text-xs font-semibold text-brand-700 hover:underline pb-2">Clear filters</button></div>
      </div>
    </div>

    <app-data-table title="Project submissions" [columns]="columns" [rows]="rows()" [pageSize]="8" [exportable]="store.can('Export Contract Data') || store.can('View Budget')" [searchKeys]="['reason', 'scope', 'lineManager', 'contractRef', 'poNumber', 'reference', 'department']" (rowClick)="open($event)" (rowAction)="act($event)" emptyTitle="No projects here" emptyDescription="Add a project with its cost, priority and head count, then submit it for a decision.">
    </app-data-table>
    <p class="text-xs text-ink-400 mt-3">Included projects go into the next-year budget on <a class="text-brand-600 font-medium" routerLink="/contracts-budget/budget-preparation">Budget Preparation</a>. Excluded and cancelled projects stay in the history. Previous years are read-only — copy a project into next year to reuse it. Contract, PO and dates are optional.</p>
  `,
})
export class ProjectRequestsComponent {
  store = inject(CrcStore);
  svc = inject(ProjectRequests);
  private ui = inject(UiService);
  cfg = inject(BudgetConfig);
  private cycle = inject(BudgetCycle);

  /** BR-SUB-003: true (with a message) when the cut-off has passed for this department. */
  private locked(dept?: string) {
    const msg = this.cycle.projectsLocked(dept);
    if (msg) this.ui.toast(msg, 6500);
    return !!msg;
  }
  private dialog = inject(MatDialog);

  field = FIELD;
  year = signal(CURRENT_FY);
  projectStatus = signal('All');
  priority = signal('All');
  submission = signal('All');
  manager = signal('All');
  lineManager = signal('All');
  department = signal('All');
  subFrom = signal('');
  subTo = signal('');

  private uniq = (get: (p: ProjectRequest) => string) => [...new Set(this.svc.projects().map(get))].filter(Boolean).sort();
  selects = computed(() => [
    { key: 'year', label: 'Financial year', all: 'All years', value: this.year, set: (v: string) => this.year.set(v), options: ['All', ...this.uniq((p) => p.financialYear).reverse()] },
    { key: 'ps', label: 'Project status', all: 'All statuses', value: this.projectStatus, set: (v: string) => this.projectStatus.set(v), options: ['All', ...this.cfg.statuses()] },
    { key: 'pr', label: 'Priority', all: 'All priorities', value: this.priority, set: (v: string) => this.priority.set(v), options: ['All', ...this.cfg.priorities()] },
    { key: 'ss', label: 'Submission status', all: 'All submission statuses', value: this.submission, set: (v: string) => this.submission.set(v), options: ['All', ...SUBMISSION_STATUSES] },
    { key: 'pm', label: 'Project manager', all: 'All managers', value: this.manager, set: (v: string) => this.manager.set(v), options: ['All', ...this.uniq((p) => p.projectManager)] },
    { key: 'lm', label: 'Line manager', all: 'All line managers', value: this.lineManager, set: (v: string) => this.lineManager.set(v), options: ['All', ...this.uniq((p) => p.lineManager)] },
    { key: 'dept', label: 'Department', all: 'All departments', value: this.department, set: (v: string) => this.department.set(v), options: ['All', ...this.cfg.departments()] },
  ]);

  waitingBudget = computed(() => this.svc.waiting().reduce((s, p) => s + projectTotal(p), 0));
  rows = computed(() => this.svc.projects()
    .filter((p) => (this.year() === 'All' || p.financialYear === this.year()) && (this.projectStatus() === 'All' || p.projectStatus === this.projectStatus()) && (this.priority() === 'All' || p.priority === this.priority())
      && (this.submission() === 'All' || p.status === this.submission()) && (this.manager() === 'All' || p.projectManager === this.manager()) && (this.lineManager() === 'All' || p.lineManager === this.lineManager()) && (this.department() === 'All' || p.department === this.department())
      && (!this.subFrom() || (!!p.submittedAt && p.submittedAt.slice(0, 10) >= this.subFrom())) && (!this.subTo() || (!!p.submittedAt && p.submittedAt.slice(0, 10) <= this.subTo())))
    .map((p) => ({ ...p, cost: projectTotal(p) })));

  private current = (r: ProjectRequest) => r.financialYear === CURRENT_FY;
  private mine = (r: ProjectRequest) => (r.status === 'Draft' || r.status === 'Returned for Modification') && this.current(r) && this.store.can('Submit Project Requests');
  private decide = (r: ProjectRequest) => r.status === 'Submitted' && this.store.can('Approve Projects');

  columns: TableColumn<any>[] = [
    { key: 'name', label: 'Project name' },
    { key: 'projectManager', label: 'Manager' },
    { key: 'projectStatus', label: 'Project status' },
    { key: 'priority', label: 'Priority', type: 'status', statusFn: (r) => ({ label: r.priority, level: PRIORITY_LEVEL[r.priority] ?? 'neutral' }) },
    { key: 'cost', label: 'Estimated cost', type: 'currency', align: 'right' },
    { key: 'headCount', label: 'Head count', type: 'number', align: 'right' },
    { key: 'financialYear', label: 'Financial year' },
    { key: 'submittedAt', label: 'Submitted', display: (r) => (r.submittedAt ? r.submittedAt.slice(0, 10) : '—') },
    { key: 'status', label: 'Submission status', type: 'status', statusFn: (r) => ({ label: r.status, level: PROJECT_LEVEL[r.status] }) },
    {
      key: 'do', label: 'Actions',
      actions: [
        { id: 'edit', label: 'Edit', icon: 'edit', hide: (r) => !this.mine(r) },
        { id: 'submit', label: 'Submit', icon: 'send', hide: (r) => !this.mine(r) },
        { id: 'include', label: 'Include', icon: 'check_circle', hide: (r) => !this.decide(r) },
        { id: 'return', label: 'Return', icon: 'undo', hide: (r) => !this.decide(r) },
        { id: 'exclude', label: 'Exclude', icon: 'block', hide: (r) => !(this.decide(r) || (r.status === 'Included in Budget' && this.current(r) && this.store.can('Approve Projects'))) },
        { id: 'cancel', label: 'Cancel', icon: 'delete_outline', hide: (r) => !this.mine(r) },
        { id: 'copy', label: 'Copy to ' + CURRENT_FY, icon: 'content_copy', hide: (r) => this.current(r) || !this.store.can('Submit Project Requests') },
      ],
    },
  ];

  showStatus(s: string) { this.year.set(CURRENT_FY); this.submission.set(s); }
  clear() { this.year.set(CURRENT_FY); for (const s of [this.projectStatus, this.priority, this.submission, this.manager, this.lineManager, this.department]) s.set('All'); this.subFrom.set(''); this.subTo.set(''); }

  open(p: ProjectRequest) {
    const fresh = this.svc.projects().find((x) => x.id === p.id) ?? p;
    this.dialog.open(ProjectDetailDialogComponent, { data: { project: fresh }, panelClass: 'app-dialog-panel', autoFocus: false, ...DIALOG_SIZE.wide });
  }

  /** The project submission form (Screen 5). `copyOf` opens a copied draft so the requester confirms the status and cost first. */
  async form(p?: ProjectRequest, copyOf?: string) {
    if (!this.ui.requires('Submit Project Requests')) return;
    if (this.locked(p?.department ?? this.cfg.departments()[0])) return;
    const v = await this.ui.form({
      title: copyOf ? 'Confirm the copied project' : p ? 'Edit project' : 'New project',
      subtitle: copyOf ? `Copied from ${copyOf}. Confirm the project status and the estimated cost before you submit it.` : p ? 'Change what you need, then submit it again' : 'Describe the project, what it costs, why it is needed and the resources it needs',
      icon: 'rocket_launch', submitLabel: copyOf ? 'Confirm and save' : p ? 'Save changes' : 'Save draft',
      values: p ? { ...p, attachments: p.attachments } : { financialYear: CURRENT_FY, projectStatus: this.cfg.statuses()[2] ?? this.cfg.statuses()[0], priority: this.cfg.priorities()[1] ?? this.cfg.priorities()[0], currency: 'OMR', department: this.cfg.departments()[0], lineManager: 'Khalid Al-Farsi', projectManager: 'Noor Al-Rawahi', headCount: 0 },
      fields: [
        { key: 'name', label: 'Project name', required: true, placeholder: 'e.g. Speech analytics for call quality' },
        { key: 'reference', label: 'Project reference number', placeholder: 'If there is one' },
        { key: 'projectStatus', label: 'Project status', type: 'select', options: this.cfg.statuses(), required: true },
        { key: 'financialYear', label: 'Financial year', type: 'select', options: [CURRENT_FY], required: true },
        { key: 'projectManager', label: 'Project manager', required: true },
        { key: 'lineManager', label: 'Line manager', required: true },
        { key: 'department', label: 'Requesting department', type: 'select', options: this.cfg.departments() },
        { key: 'priority', label: 'Priority', type: 'select', options: this.cfg.priorities(), required: true },
        { key: 'scope', label: 'Scope of work', type: 'textarea', required: true, placeholder: 'Purpose, main activities, expected deliverables, business area and outcome' },
        { key: 'currency', label: 'Currency', type: 'select', options: [...CURRENCIES], required: true, hint: 'Dollar amounts are converted to OMR in the budget.' },
        { key: 'budget', label: 'Total estimated cost', type: 'number', min: 0, required: true, hint: 'Required for new and renewed projects.' },
        { key: 'annualCost', label: 'Cost in this financial year', type: 'number', min: 0, hint: 'The part of the total that falls in the year.' },
        { key: 'monthlyCost', label: 'Monthly cost', type: 'number', min: 0, hint: 'Only where the cost is phased over months.' },
        { key: 'costBreakdown', label: 'Cost breakdown', type: 'textarea', placeholder: 'e.g. licences 8,000; implementation 3,500; support 1,000' },
        { key: 'reason', label: 'Justification', type: 'textarea', required: true, hint: 'For a new project: the business need, expected benefits, the risk of not proceeding and how it fits CRC objectives.' },
        { key: 'from', label: 'Proposed start date', type: 'date' },
        { key: 'to', label: 'Proposed end date', type: 'date' },
        { key: 'headCount', label: 'Required head count', type: 'number', min: 0 },
        { key: 'resourceRole', label: 'Resource role or position' },
        { key: 'resourceType', label: 'New or existing resource', type: 'select', options: ['New', 'Existing'] },
        { key: 'resourceSource', label: 'Resource source', type: 'select', options: ['Internal', 'Outsourced'] },
        { key: 'resourceStart', label: 'Resource required from', type: 'date' },
        { key: 'costPerResource', label: 'Cost per resource per month', type: 'number', min: 0 },
        { key: 'months', label: 'Months needed', type: 'number', min: 0, max: 12, hint: 'Resource cost = head count × cost per resource × months.' },
        { key: 'contractRef', label: 'Related vendor or contract', placeholder: 'Leave empty if there is none yet' },
        { key: 'poNumber', label: 'PO number' },
        { key: 'comments', label: 'Additional comments', type: 'textarea' },
        { key: 'attachments', label: 'Supporting attachments', type: 'file' },
      ],
    });
    if (!v) return;
    const opt = (k: string) => (v[k] === '' || v[k] === null || v[k] === undefined ? undefined : num(v[k]));
    const data: ProjectInput = {
      financialYear: v['financialYear'], name: v['name'], reference: v['reference'] || undefined, projectStatus: v['projectStatus'], scope: v['scope'], currency: v['currency'] || 'OMR', budget: num(v['budget']),
      annualCost: opt('annualCost'), monthlyCost: opt('monthlyCost'), costBreakdown: v['costBreakdown'] || undefined, reason: v['reason'], priority: v['priority'], department: v['department'] || undefined,
      projectManager: v['projectManager'], lineManager: v['lineManager'], headCount: num(v['headCount']), resourceRole: v['resourceRole'] || undefined, resourceType: v['resourceType'] || undefined, resourceSource: v['resourceSource'] || undefined,
      resourceStart: v['resourceStart'] || undefined, costPerResource: opt('costPerResource'), months: opt('months'),
      comments: v['comments'] || undefined, attachments: v['attachments'] ?? [], contractRef: v['contractRef'] || undefined, poNumber: v['poNumber'] || undefined, from: v['from'] || undefined, to: v['to'] || undefined,
    };
    const check = this.svc.validate(data, p?.id);
    if (check.error) { this.ui.toast(check.error, 6000); return; }
    if (this.locked(data.department)) return;
    if (p) { this.svc.edit(p.id, data); this.ui.toast(copyOf ? 'Confirmed. Submit it when it is ready.' : 'Project updated.'); }
    else { this.svc.create(data); this.ui.toast('Project saved as a draft. Submit it when it is ready.'); }
    if (check.warnings.length) setTimeout(() => this.ui.toast(check.warnings[0], 6500), 800);
  }

  async act(e: { row: any; id: string }) {
    const p = this.svc.projects().find((x) => x.id === e.row.id);
    if (!p) return;
    if (e.id === 'edit') return this.form(p);
    if (e.id === 'copy') {
      const c = this.svc.copy(p.id, CURRENT_FY);
      this.year.set(CURRENT_FY);
      if (!c) { this.ui.toast('Could not copy.'); return; }
      this.ui.toast(`Copied to ${CURRENT_FY} as a draft. The ${p.financialYear} submission is kept.`);
      await this.form(c, p.financialYear); // confirm status and cost (BR-PRJ-011)
      return;
    }
    if (e.id === 'submit') {
      if (!this.ui.requires('Submit Project Requests')) return;
      if (this.locked(p.department)) return;
      const check = this.svc.validate(p, p.id);
      if (check.error) { this.ui.toast(check.error, 6000); return; }
      this.svc.submit(p.id);
      this.ui.toast('Submitted — the Budget Owner has been notified.');
      return;
    }
    if (e.id === 'include') {
      if (!this.ui.requires('Approve Projects')) return;
      const v = await this.ui.form({ title: 'Include this project', subtitle: `${p.name} · ${projectTotal(p).toLocaleString()} OMR goes into next year's budget`, icon: 'check_circle', submitLabel: 'Include', fields: [{ key: 'note', label: 'Comment (optional)', type: 'textarea' }] });
      if (!v) return;
      this.svc.include(p.id, v['note'] ?? '');
      this.ui.toast('Project included in the budget.');
      return;
    }
    if (e.id === 'return') {
      if (!this.ui.requires('Approve Projects')) return;
      const v = await this.ui.form({ title: 'Return for modification', subtitle: `${p.name} goes back to ${p.requestedBy}`, icon: 'undo', submitLabel: 'Return', fields: [{ key: 'note', label: 'What needs to change?', type: 'textarea', required: true }] });
      if (!v) return;
      this.svc.returnForModification(p.id, v['note']);
      this.ui.toast('Returned to the requester.');
      return;
    }
    if (e.id === 'exclude') {
      if (!this.ui.requires('Approve Projects')) return;
      const v = await this.ui.form({ title: 'Exclude from the budget', subtitle: p.status === 'Included in Budget' ? `${p.name} — its ${projectTotal(p).toLocaleString()} OMR is taken out of the budget` : p.name, icon: 'block', submitLabel: 'Exclude', fields: [{ key: 'note', label: 'Reason', type: 'textarea', required: true, hint: 'Excluded projects stay in the history.' }] });
      if (!v) return;
      this.svc.exclude(p.id, v['note']);
      this.ui.toast('Project excluded. It stays in the history.');
      return;
    }
    if (e.id === 'cancel') {
      if (!this.ui.requires('Submit Project Requests')) return;
      if (this.locked(p.department)) return;
      const ok = await this.ui.confirm({ title: 'Cancel this project?', message: `${p.name} will be marked as Cancelled and stay in the history.`, confirmLabel: 'Cancel project', danger: true });
      if (!ok) return;
      this.svc.cancel(p.id, 'Cancelled by the requester.');
      this.ui.toast('Project cancelled.');
    }
  }
}
