import { Injectable, computed, inject, signal } from '@angular/core';
import { CURRENT_USER, CrcStore } from './crc-store.service';
import { CURRENT_FY, ProjectEvent, ProjectRequest, SEED_PROJECTS, projectTotal } from './project-data';

export type ProjectInput = Omit<ProjectRequest, 'id' | 'requestedBy' | 'status' | 'updatedAt' | 'history' | 'decisionNote' | 'decidedBy' | 'decidedAt' | 'copiedFrom' | 'submittedAt'>;

/**
 * Project budget requests. Requesters (Team Lead / Line Manager / Project Manager) add, edit and cancel projects and submit them;
 * the approver (Budget Owner) includes, returns or excludes each one. Included projects feed the next-year budget cycle;
 * every project stays in the history with who decided and why.
 */
@Injectable({ providedIn: 'root' })
export class ProjectRequests {
  private store = inject(CrcStore);
  private seq = 100;

  readonly projects = signal<ProjectRequest[]>(SEED_PROJECTS);

  readonly current = computed(() => this.projects().filter((p) => p.financialYear === CURRENT_FY));
  readonly waiting = computed(() => this.current().filter((p) => p.status === 'Submitted'));
  readonly included = computed(() => this.current().filter((p) => p.status === 'Included in Budget'));
  readonly returned = computed(() => this.current().filter((p) => p.status === 'Returned for Modification'));
  readonly includedTotal = computed(() => this.included().reduce((s, p) => s + projectTotal(p), 0));

  private event(action: ProjectEvent['action'], note: string): ProjectEvent {
    return { at: new Date().toISOString(), by: CURRENT_USER, role: this.store.currentRole(), action, note };
  }

  private change(id: string, fn: (p: ProjectRequest) => Partial<ProjectRequest>, action: ProjectEvent['action'], note: string) {
    this.projects.update((list) => list.map((p) => {
      if (p.id !== id) return p;
      const ev = this.event(action, note);
      return { ...p, ...fn(p), updatedAt: ev.at, history: [...p.history, ev] };
    }));
    return this.projects().find((p) => p.id === id)!;
  }

  /** The validation rules of the SRS: returns the first blocking problem (or null) and any warnings. */
  validate(v: Partial<ProjectInput>, editingId?: string): { error: string | null; warnings: string[] } {
    const warnings: string[] = [];
    const fail = (error: string) => ({ error, warnings });
    if (!v.financialYear) return fail('Financial year is mandatory.');
    if (!v.name?.trim()) return fail('Project name is mandatory.');
    if (!v.projectStatus) return fail('Project status is mandatory.');
    if (!v.scope?.trim()) return fail('Scope of work is mandatory.');
    if (!v.reason?.trim()) return fail('Justification is mandatory.');
    if (!v.priority) return fail('Priority is mandatory.');
    const cost = Number(v.budget);
    if (!isFinite(cost) || cost < 0) return fail('Estimated cost must be a number that is not negative.');
    if ((v.projectStatus === 'New Proposed Project' || v.projectStatus === 'Need Renewal') && !(cost > 0)) return fail('Estimated cost is mandatory for proposed or renewed projects.');
    const hc = Number(v.headCount ?? 0);
    if (!Number.isInteger(hc) || hc < 0) return fail('Head count must be a whole number, zero or more.');
    if (hc > 0 && (!v.resourceRole?.trim() || !(Number(v.costPerResource) >= 0) || !(Number(v.months) > 0))) return fail('Head count needs the resource role, the cost per resource and the number of months.');
    const dup = this.projects().find((p) => p.id !== editingId && p.financialYear === v.financialYear && p.name.trim().toLowerCase() === v.name!.trim().toLowerCase() && p.status !== 'Cancelled');
    if (dup) return fail(`"${dup.name}" is already submitted for ${v.financialYear}. Edit that project instead of adding a duplicate.`);
    if (v.projectStatus === 'Need Cancellation' && cost > 0) warnings.push('A project marked for cancellation has a positive cost. The justification should explain it.');
    return { error: null, warnings };
  }

  create(v: ProjectInput): ProjectRequest {
    const ev = this.event('Created', 'Project added.');
    const p: ProjectRequest = { ...v, id: 'PRJ-' + ++this.seq, requestedBy: CURRENT_USER, status: 'Draft', updatedAt: ev.at, history: [ev] };
    this.projects.update((l) => [p, ...l]);
    this.store.log('Project Added', p.name, `${p.financialYear} · ${projectTotal(p).toLocaleString()} OMR — ${p.reason}`, 'Success', CURRENT_USER, { newValue: 'Draft' });
    return p;
  }

  edit(id: string, v: ProjectInput) {
    const p = this.change(id, () => v, 'Edited', 'Details updated.');
    this.store.log('Project Edited', p.name, `${projectTotal(p).toLocaleString()} OMR requested.`);
  }

  submit(id: string) {
    const before = this.projects().find((x) => x.id === id);
    const again = before?.status === 'Returned for Modification';
    const p = this.change(id, () => ({ status: 'Submitted' as const, submittedAt: new Date().toISOString(), decisionNote: undefined, decidedBy: undefined, decidedAt: undefined }), again ? 'Resubmitted' : 'Submitted', again ? 'Revised and sent again.' : 'Sent for a decision.');
    this.store.log(again ? 'Project Resubmitted' : 'Project Submitted', p.name, `${projectTotal(p).toLocaleString()} OMR waiting for the Budget Owner.`, 'Success', CURRENT_USER, { previousValue: before?.status, newValue: 'Submitted' });
    this.store.notify(`Project "${p.name}" is waiting for a decision.`, 'Project requests', 'info', '/contracts-budget/projects');
  }

  /** The approver includes a project: it becomes part of next year's budget. */
  include(id: string, note: string) {
    const p = this.change(id, () => ({ status: 'Included in Budget' as const, decisionNote: note || undefined, decidedBy: CURRENT_USER, decidedAt: new Date().toISOString() }), 'Included', note || 'Included in the coming budget.');
    this.store.log('Project Included in Budget', p.name, note || 'Included in next year\'s budget.', 'Success', CURRENT_USER, { previousValue: 'Submitted', newValue: 'Included in Budget' });
    this.store.notify(`Project "${p.name}" was included in the budget.`, 'Project requests', 'green', '/contracts-budget/projects');
  }

  returnForModification(id: string, note: string) {
    const p = this.change(id, () => ({ status: 'Returned for Modification' as const, decisionNote: note, decidedBy: CURRENT_USER, decidedAt: new Date().toISOString() }), 'Returned', note);
    this.store.log('Project Returned', p.name, note, 'Success', CURRENT_USER, { previousValue: 'Submitted', newValue: 'Returned for Modification' });
    this.store.notify(`Project "${p.name}" was returned for changes.`, 'Project requests', 'amber', '/contracts-budget/projects');
  }

  exclude(id: string, note: string) {
    const before = this.projects().find((x) => x.id === id);
    const p = this.change(id, () => ({ status: 'Excluded from Budget' as const, decisionNote: note || undefined, decidedBy: CURRENT_USER, decidedAt: new Date().toISOString() }), 'Excluded', note || 'Not included this year.');
    this.store.log('Project Excluded from Budget', p.name, note || 'Excluded from next year\'s budget.', 'Success', CURRENT_USER, { previousValue: before?.status, newValue: 'Excluded from Budget' });
  }

  /** The requester withdraws a project. It stays in the history as Cancelled. */
  cancel(id: string, note: string) {
    const before = this.projects().find((x) => x.id === id);
    const p = this.change(id, () => ({ status: 'Cancelled' as const, decisionNote: note || undefined, decidedBy: CURRENT_USER, decidedAt: new Date().toISOString() }), 'Cancelled', note || 'Cancelled by the requester.');
    this.store.log('Project Cancelled', p.name, note || 'Cancelled by the requester.', 'Success', CURRENT_USER, { previousValue: before?.status, newValue: 'Cancelled' });
  }

  /** Copies a previous submission into the next financial year as a new draft. The original is preserved. */
  copy(id: string, financialYear: string): ProjectRequest | undefined {
    const src = this.projects().find((x) => x.id === id);
    if (!src) return undefined;
    const ev = this.event('Copied', `Copied from ${src.financialYear}.`);
    const p: ProjectRequest = { ...src, id: 'PRJ-' + ++this.seq, financialYear, status: 'Draft', copiedFrom: src.id, decisionNote: undefined, decidedBy: undefined, decidedAt: undefined, submittedAt: undefined, requestedBy: CURRENT_USER, updatedAt: ev.at, history: [ev] };
    this.projects.update((l) => [p, ...l]);
    this.store.log('Project Copied', p.name, `Copied from ${src.financialYear} to ${financialYear} as a draft.`, 'Success', CURRENT_USER, { previousValue: src.id, newValue: p.id });
    return p;
  }
}
