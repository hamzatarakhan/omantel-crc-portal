import { Injectable, computed, inject, signal } from '@angular/core';
import { CURRENT_USER, CrcStore } from './crc-store.service';
import { ProjectEvent, ProjectRequest, SEED_PROJECTS } from './project-data';

export type ProjectInput = { name: string; scope: string; contractRef?: string; poNumber?: string; from?: string; to?: string; budget: number; reason: string };

/**
 * Project requests. Requesters (Team Lead / Line Manager) add, edit and remove projects and submit them with the budget needed
 * and why; the approver (Budget Owner) keeps, removes or sends each one back. Kept projects become lines in next year's budget;
 * removed ones stay in the history with who removed them and why.
 */
@Injectable({ providedIn: 'root' })
export class ProjectRequests {
  private store = inject(CrcStore);
  private seq = 100;

  readonly projects = signal<ProjectRequest[]>(SEED_PROJECTS);

  readonly waiting = computed(() => this.projects().filter((p) => p.status === 'Submitted'));
  readonly kept = computed(() => this.projects().filter((p) => p.status === 'Kept'));
  readonly keptBudget = computed(() => this.kept().reduce((s, p) => s + p.budget, 0));

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

  create(v: ProjectInput): ProjectRequest {
    const ev = this.event('Created', 'Project added.');
    const p: ProjectRequest = { id: 'PRJ-' + ++this.seq, ...v, requestedBy: CURRENT_USER, status: 'Draft', updatedAt: ev.at, history: [ev] };
    this.projects.update((l) => [p, ...l]);
    this.store.log('Project Added', p.name, `${p.budget.toLocaleString()} OMR requested — ${p.reason}`, 'Success', CURRENT_USER, { newValue: 'Draft' });
    return p;
  }

  edit(id: string, v: ProjectInput) {
    const p = this.change(id, () => v, 'Edited', 'Details updated.');
    this.store.log('Project Edited', p.name, `${p.budget.toLocaleString()} OMR requested.`);
  }

  submit(id: string) {
    const before = this.projects().find((x) => x.id === id);
    const again = before?.status === 'Sent back';
    const p = this.change(id, () => ({ status: 'Submitted' as const, decisionNote: undefined, decidedBy: undefined, decidedAt: undefined }), again ? 'Resubmitted' : 'Submitted', again ? 'Revised and sent again.' : 'Sent for a decision.');
    this.store.log(again ? 'Project Resubmitted' : 'Project Submitted', p.name, `${p.budget.toLocaleString()} OMR waiting for the Budget Owner.`, 'Success', CURRENT_USER, { previousValue: before?.status, newValue: 'Submitted' });
    this.store.notify(`Project "${p.name}" is waiting for a decision.`, 'Project requests', 'info', '/contracts-budget/projects');
  }

  /** The approver keeps a project: it becomes a line in next year's budget. */
  keep(id: string, note: string) {
    const p = this.change(id, () => ({ status: 'Kept' as const, decisionNote: note || undefined, decidedBy: CURRENT_USER, decidedAt: new Date().toISOString() }), 'Kept', note || 'Approved for the coming budget.');
    this.store.addBudgetAddition({ id: 'ADD-' + p.id, category: 'Projects', item: p.name, amount: p.budget, source: 'Project request', projectId: p.id, note: p.scope });
    this.store.log('Project Kept', p.name, note || 'Kept and added to next year\'s budget.', 'Success', CURRENT_USER, { previousValue: 'Submitted', newValue: 'Kept' });
    this.store.notify(`Project "${p.name}" was kept and added to the budget.`, 'Project requests', 'green', '/contracts-budget/projects');
  }

  sendBack(id: string, note: string) {
    const p = this.change(id, () => ({ status: 'Sent back' as const, decisionNote: note, decidedBy: CURRENT_USER, decidedAt: new Date().toISOString() }), 'Sent back', note);
    this.store.log('Project Sent Back', p.name, note, 'Success', CURRENT_USER, { previousValue: 'Submitted', newValue: 'Sent back' });
    this.store.notify(`Project "${p.name}" was sent back for changes.`, 'Project requests', 'amber', '/contracts-budget/projects');
  }

  /** Removed projects are kept for history; if the project was already in the budget, its line is taken out. */
  remove(id: string, note: string) {
    const before = this.projects().find((x) => x.id === id);
    const p = this.change(id, () => ({ status: 'Removed' as const, decisionNote: note || undefined, decidedBy: CURRENT_USER, decidedAt: new Date().toISOString() }), 'Removed', note || 'Removed.');
    if (before?.status === 'Kept') this.store.removeBudgetAddition('ADD-' + id);
    this.store.log('Project Removed', p.name, note || 'Removed from the project list.', 'Success', CURRENT_USER, { previousValue: before?.status, newValue: 'Removed' });
  }
}
