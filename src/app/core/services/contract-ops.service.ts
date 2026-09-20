import { Injectable, computed, inject, signal } from '@angular/core';
import { Contract, ContractRecord, SyncRun } from '../models/domain';
import { CURRENT_USER, CrcStore } from './crc-store.service';
import { addDays, attachmentsFor, childRecordsFor } from './contract-data';
import {
  ContractChange, DataIssue, EscalationEvent, EscalationRule, EscalationStatus, ListRow, MonitoringAction, NotificationTemplate, SEED_TEMPLATES, SyncConfig,
  SyncError, SyncState, baseEscalationStatus, dataIssuesFor, escalationApplies, needsAction, nextRunAt, requiredActionFor, seedChanges, statusLevelFor,
} from './contract-monitoring';

export interface DataScope { vendor: string; contractType: string; department: string }
export const ALL_SCOPE: DataScope = { vendor: 'All', contractType: 'All', department: 'All' };

export interface SyncOutcome {
  outcome: 'completed' | 'no-changes' | 'failed';
  message: string;
  changed: boolean;
}

const isoDay = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

/**
 * Everything the SRS adds around contract tracking that is not the contract data itself: monitoring actions,
 * escalation, synchronization (config, failures, error log, change history), notification templates and access scope.
 */
@Injectable({ providedIn: 'root' })
export class ContractOps {
  private store = inject(CrcStore);
  private seq = 900;
  private next = () => ++this.seq;
  private cache = new Map<string, ContractRecord[]>();

  // ---------- configuration ----------
  readonly syncConfig = signal<SyncConfig>({ enabled: true, frequency: 'Daily', time: '02:00', timezone: 'Asia/Muscat (GMT+4)', timeoutSec: 60 });
  readonly nextRun = computed(() => (this.syncConfig().enabled ? nextRunAt(this.syncConfig()) : null));
  readonly escalationRule = signal<EscalationRule>({ hours: 48, appliesTo: [], recipients: 'Senior management' });
  readonly templates = signal<NotificationTemplate[]>(SEED_TEMPLATES);
  readonly roleScopes = signal<Record<string, DataScope>>({});

  // ---------- state ----------
  readonly actions = signal<MonitoringAction[]>(this.seedActions());
  readonly escalationEvents = signal<Record<string, EscalationEvent[]>>({});
  readonly changes = signal<ContractChange[]>(seedChanges(this.store.contracts()));
  readonly syncState = signal<Record<string, SyncState>>({
    'CT-1003': { status: 'Failed', at: isoDay(0) + 'T03:30:00', by: CURRENT_USER, type: 'Manual', message: 'The ERP did not respond within 60 seconds (HTTP 504). Last synchronized data was kept.' },
  });
  readonly errorLog = signal<SyncError[]>([
    { id: 'E3', runId: 'S5', syncType: 'Manual', at: isoDay(0) + 'T03:30:00', contractReference: '2025-013T-00-04', erpReference: 'ERP-VEN-5003', initiatedBy: CURRENT_USER, message: 'The ERP did not respond within 60 seconds (HTTP 504). Last synchronized data was kept.', category: 'Timeout', processing: 'Failed – last valid data retained', resolution: 'Open' },
    { id: 'E2', runId: 'S2', syncType: 'Automated', at: isoDay(-1) + 'T02:03:00', contractReference: '2024-009T-00-14', erpReference: 'ERP-VEN-5044', initiatedBy: 'System Scheduler', message: 'End date 2024-02-01 is earlier than start date 2024-03-01 (BR-CT-003). The record was rejected and logged as a data-quality error.', category: 'Data quality', processing: 'Record rejected', resolution: 'Open' },
    { id: 'E1', runId: 'S1', syncType: 'Automated', at: isoDay(-2) + 'T02:01:10', contractReference: '—', erpReference: '—', initiatedBy: 'System Scheduler', message: 'ERP endpoint returned HTTP 503 (Service Unavailable). No records were marked expired or missing; the last synchronized data was retained.', category: 'Connectivity', processing: 'Failed – last valid data retained', resolution: 'Resolved', resolutionNote: 'The next scheduled synchronization completed successfully.', resolvedAt: isoDay(-1) + 'T02:00:00' },
  ]);
  /** The first manual sync of these contracts fails with an ERP timeout so the retry flow can be shown. */
  private failOnce = new Set(['CT-1006']);

  // ---------- access scope (SRS 1.20) ----------
  scopeFor(role: string): DataScope { return this.roleScopes()[role] ?? ALL_SCOPE; }

  setScope(role: string, patch: Partial<DataScope>) {
    const before = this.scopeFor(role);
    this.roleScopes.update((m) => ({ ...m, [role]: { ...before, ...patch } }));
    this.store.log('Access Scope Changed', role, `Data scope for ${role} updated.`, 'Success', CURRENT_USER, { previousValue: JSON.stringify(before), newValue: JSON.stringify({ ...before, ...patch }) });
  }

  private inScope(c: Contract, s: DataScope) {
    return (s.vendor === 'All' || c.vendorName === s.vendor) && (s.contractType === 'All' || c.contractType === s.contractType) && (s.department === 'All' || c.department === s.department);
  }

  /** Contracts the current role may see. Cancelled contracts stay in this list (they are historical, not hidden). */
  readonly scoped = computed(() => {
    const s = this.scopeFor(this.store.currentRole());
    return this.store.contracts().filter((c) => this.inScope(c, s));
  });
  /** Contracts shown on active screens: everything except contracts cancelled in the ERP (FR-CT-017). */
  readonly active = computed(() => this.scoped().filter((c) => c.status !== 'Cancelled'));
  readonly historical = computed(() => this.scoped().filter((c) => c.status === 'Cancelled'));

  // ---------- derived per contract ----------
  childrenOf(c: Contract): ContractRecord[] {
    const key = `${c.id}|${c.startDate}|${c.endDate}|${c.amount}`;
    let v = this.cache.get(key);
    if (!v) { v = childRecordsFor(c); this.cache.set(key, v); }
    return v;
  }

  issuesFor(c: Contract): DataIssue[] { return dataIssuesFor(c, this.childrenOf(c)); }
  requiredAction(c: Contract) { return requiredActionFor(c); }
  needsAction(c: Contract) { return needsAction(c) || this.openActions(c).length > 0; }
  openActions(c: Contract) { return this.actions().filter((a) => a.contractId === c.id && (a.status === 'Open' || a.status === 'In progress')); }

  escalationStatus(c: Contract): EscalationStatus {
    const events = this.escalationEvents()[c.id];
    const manual = events?.[events.length - 1];
    if (c.status === 'Cancelled' || c.renewalStatus === 'Renewed') return baseEscalationStatus(c, this.escalationRule());
    return manual ? manual.status : baseEscalationStatus(c, this.escalationRule());
  }
  isUnresolved(c: Contract) { return ['Pending action', 'Action in progress', 'Escalated'].includes(this.escalationStatus(c)); }
  isEscalated(c: Contract) { return this.escalationStatus(c) === 'Escalated'; }
  escalationDate(c: Contract) { return addDays(c.endDate, -Math.ceil(this.escalationRule().hours / 24)); }

  /** System-generated escalation event (when the trigger date passed) followed by the manual updates. */
  escalationHistory(c: Contract): EscalationEvent[] {
    const rule = this.escalationRule();
    const out: EscalationEvent[] = [];
    if (c.status !== 'Cancelled' && escalationApplies(c, rule) && c.renewalStatus !== 'Renewed' && c.daysRemaining <= rule.hours / 24) {
      out.push({ at: `${this.escalationDate(c)}T08:00:00`, status: 'Escalated', reason: `Contract not renewed or closed ${rule.hours} hours before expiry (${c.endDate}).`, recipients: rule.recipients, comments: c.renewalStatus ? `Renewal status: ${c.renewalStatus}.` : 'No renewal on record.', by: 'System (Notification Engine)' });
    }
    return [...out, ...(this.escalationEvents()[c.id] ?? [])];
  }

  syncInfo(c: Contract) {
    const st = this.syncState()[c.id];
    const runs = this.store.syncRuns().filter((r) => !r.contractReference || r.contractReference === c.reference);
    const last = runs[0];
    return {
      lastSuccessAt: c.lastSyncedAt,
      lastAttemptAt: last?.finishedAt ?? c.lastSyncedAt,
      lastStatus: last ? (last.status === 'Completed' ? 'Completed successfully' : last.status) : 'Never',
      initiatedBy: last?.initiatedBy ?? '—',
      type: last?.type ?? '—',
      error: last?.status === 'Failed' ? (last.errorMessage ?? 'Synchronization failed.') : '',
      failed: st?.status === 'Failed',
    };
  }

  // ---------- the list: contracts and their child records ----------
  readonly records = computed<ListRow[]>(() => {
    const rows: ListRow[] = [];
    const sync = this.syncState();
    for (const c of this.scoped()) {
      const syncStatus = sync[c.id]?.status === 'Failed' ? 'Failed' : 'Synced';
      rows.push({
        id: c.id, parentId: c.id, reference: c.reference, name: c.name, recordType: c.recordType, parentReference: '', contractType: c.contractType, vendorName: c.vendorName,
        vendorRef: c.erpVendorId ?? '', poNumber: c.poNumber ?? '', startDate: c.startDate, endDate: c.endDate, daysRemaining: c.daysRemaining, amount: c.amount, currency: c.currency,
        status: c.status, level: statusLevelFor(c), renewalStatus: c.renewalStatus ?? '', erpReference: c.erpReference, lastSyncedAt: c.lastSyncedAt, syncStatus, department: c.department ?? '',
      });
      for (const k of this.childrenOf(c)) {
        const status = k.status === 'Closed' ? 'Expired' : k.status;
        rows.push({
          id: k.id, parentId: c.id, reference: k.reference, name: k.description, recordType: k.recordType, parentReference: c.reference, contractType: c.contractType, vendorName: k.counterparty,
          vendorRef: c.erpVendorId ?? '', poNumber: k.poNumber, startDate: k.startDate, endDate: k.endDate, daysRemaining: k.daysRemaining, amount: k.amount ?? null, currency: k.currency,
          status, level: c.status === 'Cancelled' ? 'neutral' : statusLevelFor({ status: status as Contract['status'], daysRemaining: k.daysRemaining, renewalStatus: undefined }), renewalStatus: '', erpReference: k.erpReference, lastSyncedAt: c.lastSyncedAt, syncStatus, department: c.department ?? '',
        });
      }
    }
    return rows;
  });

  // ---------- monitoring actions ----------
  private seedActions(): MonitoringAction[] {
    const cs = this.store.contracts();
    const mk = (i: number, type: string, status: MonitoringAction['status'], dueOffset: number, comments: string, erp: string): MonitoringAction => {
      const c = cs[i];
      return {
        id: 'ACT-' + (200 + i * 3 + dueOffset + 40), contractId: c.id, contractReference: c.reference, type, owner: c.contractManager ?? CURRENT_USER, dueDate: isoDay(dueOffset), status,
        comments, erpTransactionRef: erp, completedDate: status === 'Completed' ? isoDay(-1) : undefined, createdBy: CURRENT_USER, createdAt: new Date(Date.now() - 6 * 86400000).toISOString(), lastUpdatedBy: CURRENT_USER, updatedAt: new Date(Date.now() - 86400000).toISOString(),
      };
    };
    return [
      mk(0, 'Initiate renewal in ERP', 'In progress', 3, 'Renewal request raised; waiting for vendor to confirm revised rates.', 'ERP-RENEW-4471'),
      mk(0, 'Review contract', 'Completed', -2, 'Scope and SLA reviewed with the Customer Care owner.', ''),
      mk(1, 'Request extension in ERP', 'Open', 2, 'Extension of 90 days proposed while the tender is finalised.', ''),
      mk(2, 'Follow up on pending PO', 'Open', 5, 'PO for the next quarter has not been released by Finance.', 'ERP-PO-88213'),
      mk(3, 'Review contract', 'Open', 12, 'Annual performance review before renewal.', ''),
    ];
  }

  addAction(c: Contract, v: Record<string, any>) {
    const now = new Date().toISOString();
    const a: MonitoringAction = {
      id: 'ACT-' + this.next(), contractId: c.id, contractReference: c.reference, type: v['type'], owner: v['owner'], dueDate: v['dueDate'], status: v['status'] ?? 'Open',
      comments: v['comments'] ?? '', erpTransactionRef: v['erpTransactionRef'] ?? '', createdBy: CURRENT_USER, createdAt: now, lastUpdatedBy: CURRENT_USER, updatedAt: now,
    };
    this.actions.update((l) => [a, ...l]);
    this.store.log('Monitoring Action Created', c.reference, `${a.type} — owner ${a.owner}, due ${a.dueDate}.`, 'Success', CURRENT_USER, { erpReference: c.erpReference, newValue: a.status });
    return a;
  }

  updateAction(id: string, patch: Partial<MonitoringAction>) {
    const before = this.actions().find((a) => a.id === id);
    if (!before) return;
    const status = patch.status ?? before.status;
    const next: MonitoringAction = { ...before, ...patch, status, completedDate: status === 'Completed' || status === 'Closed' ? (patch.completedDate ?? before.completedDate ?? isoDay(0)) : undefined, lastUpdatedBy: CURRENT_USER, updatedAt: new Date().toISOString() };
    this.actions.update((l) => l.map((a) => (a.id === id ? next : a)));
    const c = this.store.contracts().find((x) => x.id === before.contractId);
    this.store.log('Monitoring Action Updated', before.contractReference, `${before.type}: ${status === before.status ? 'details edited' : `status ${before.status} → ${status}`}.`, 'Success', CURRENT_USER, { erpReference: c?.erpReference, previousValue: before.status, newValue: status });
    if (patch.status === 'Completed' && before.type === 'Escalate contract' && c) this.recordEscalation(c, { status: 'Escalated', comments: next.comments || 'Escalated through a monitoring action.' });
  }

  // ---------- escalation ----------
  recordEscalation(c: Contract, v: { status: EscalationStatus; comments: string; resolutionDate?: string; responsibleUser?: string; supportingRef?: string; erpUpdateRef?: string }) {
    const resolved = v.status === 'Resolved' || v.status === 'Closed';
    const ev: EscalationEvent = {
      at: new Date().toISOString(), status: v.status, reason: resolved ? 'Resolution recorded' : v.status === 'Escalated' ? 'Escalated manually' : 'Status updated by the contract owner', recipients: this.escalationRule().recipients,
      resolutionDate: resolved ? (v.resolutionDate || isoDay(0)) : undefined, comments: v.comments, responsibleUser: v.responsibleUser, supportingRef: v.supportingRef, erpUpdateRef: v.erpUpdateRef, by: CURRENT_USER,
    };
    const before = this.escalationStatus(c);
    this.escalationEvents.update((m) => ({ ...m, [c.id]: [...(m[c.id] ?? []), ev] }));
    this.store.log(resolved ? 'Escalation Resolved' : 'Escalation Updated', c.reference, `${before} → ${v.status}. ${v.comments}`, 'Success', CURRENT_USER, { erpReference: c.erpReference, previousValue: before, newValue: v.status });
    if (v.status === 'Escalated') this.store.notify(`${c.reference} was escalated to ${this.escalationRule().recipients}.`, 'Contracts & Budget', 'red', `/contracts-budget/contracts/${c.id}`);
  }

  setEscalationRule(rule: EscalationRule) {
    const before = this.escalationRule();
    this.escalationRule.set(rule);
    this.store.log('Escalation Rule Changed', 'Escalation rule', `Threshold ${rule.hours} hours; applies to ${rule.appliesTo.length ? rule.appliesTo.join(', ') : 'all contract types'}.`, 'Success', CURRENT_USER, { previousValue: `${before.hours} h · ${before.appliesTo.join(', ') || 'all types'} · ${before.recipients}`, newValue: `${rule.hours} h · ${rule.appliesTo.join(', ') || 'all types'} · ${rule.recipients}` });
  }

  // ---------- synchronization ----------
  setSyncConfig(cfg: SyncConfig) {
    const before = this.syncConfig();
    this.syncConfig.set(cfg);
    this.store.log('Sync Configuration Changed', 'Synchronization schedule', cfg.enabled ? `Automated sync: ${cfg.frequency} at ${cfg.time} (${cfg.timezone}), timeout ${cfg.timeoutSec}s.` : 'Automated sync switched off.', 'Success', CURRENT_USER, { previousValue: `${before.enabled ? before.frequency + ' ' + before.time : 'off'} · ${before.timeoutSec}s`, newValue: `${cfg.enabled ? cfg.frequency + ' ' + cfg.time : 'off'} · ${cfg.timeoutSec}s` });
  }

  private addRun(run: Omit<SyncRun, 'id'>): SyncRun {
    const full: SyncRun = { id: 'S' + this.next(), ...run };
    this.store.syncRuns.update((l) => [full, ...l]);
    return full;
  }

  private addError(e: Omit<SyncError, 'id' | 'resolution'>) {
    this.errorLog.update((l) => [{ id: 'E' + this.next(), resolution: 'Open', ...e }, ...l]);
  }

  private addChange(c: Contract, field: string, previous: string, next: string, source: ContractChange['source']) {
    this.changes.update((l) => [{ id: 'CHG-' + this.next(), contractId: c.id, contractReference: c.reference, at: new Date().toISOString(), field, previous, next, source }, ...l]);
  }

  /** Manual "Sync from ERP" for one contract. On failure the last valid data is kept (FR-CT-012, BR-CT-012). */
  syncContract(id: string): SyncOutcome {
    const c = this.store.contracts().find((x) => x.id === id);
    if (!c) return { outcome: 'failed', message: 'Contract not found.', changed: false };
    const started = new Date().toISOString();
    const kids = this.childrenOf(c);
    const atts = attachmentsFor(c, kids).length;

    if (this.failOnce.has(id)) {
      this.failOnce.delete(id);
      const message = `The ERP did not respond within ${this.syncConfig().timeoutSec} seconds (HTTP 504). Last synchronized data was kept.`;
      const run = this.addRun({ type: 'Manual', startedAt: started, finishedAt: new Date().toISOString(), initiatedBy: CURRENT_USER, processed: 1, created: 0, updated: 0, rejected: 0, errors: 1, contractReference: c.reference, errorMessage: message, status: 'Failed' });
      this.addError({ runId: run.id, syncType: 'Manual', at: run.finishedAt, contractReference: c.reference, erpReference: c.erpReference, initiatedBy: CURRENT_USER, message, category: 'Timeout', processing: 'Failed – last valid data retained' });
      this.syncState.update((m) => ({ ...m, [id]: { status: 'Failed', at: run.finishedAt, by: CURRENT_USER, type: 'Manual', message } }));
      this.store.log('Contract Sync Failed', c.reference, message, 'Failed', CURRENT_USER, { erpReference: c.erpReference, syncType: 'Manual' });
      return { outcome: 'failed', message, changed: false };
    }

    const { contract, changed } = this.store.applyErpChanges(c);
    this.store.contracts.update((l) => l.map((x) => (x.id === id ? contract : x)));
    if (changed) {
      this.addChange(c, 'Contract end date', c.endDate, contract.endDate, 'Manual sync');
      this.addChange(c, 'Renewal status', c.renewalStatus ?? '—', contract.renewalStatus ?? '—', 'Manual sync');
      this.store.notify(`${c.reference} was renewed in the ERP.`, 'Contracts & Budget', 'info', '/contracts-budget/contracts/' + id);
    }
    const run = this.addRun({ type: 'Manual', startedAt: started, finishedAt: new Date().toISOString(), initiatedBy: CURRENT_USER, processed: 1 + kids.length, created: 0, updated: changed ? 1 : 0, rejected: 0, errors: 0, contractReference: c.reference, status: changed ? 'Completed' : 'No Changes' });
    this.syncState.update((m) => ({ ...m, [id]: { status: changed ? 'Success' : 'No changes', at: run.finishedAt, by: CURRENT_USER, type: 'Manual' } }));
    this.errorLog.update((l) => l.map((e) => (e.contractReference === c.reference && e.resolution === 'Open' && e.syncType === 'Manual' ? { ...e, resolution: 'Retried successfully', resolvedAt: run.finishedAt, resolutionNote: 'A later manual synchronization succeeded.' } : e)));
    const scope = `${kids.length} linked record${kids.length === 1 ? '' : 's'} and ${atts} attachment${atts === 1 ? '' : 's'}`;
    this.store.log('Contract Sync', c.reference, changed ? `Manual sync: renewal found in the ERP — end date extended to ${contract.endDate}.` : 'Manual sync: no changes found in the ERP.', 'Success', CURRENT_USER, { erpReference: c.erpReference, syncType: 'Manual', previousValue: changed ? c.endDate : undefined, newValue: changed ? contract.endDate : undefined });
    return { outcome: changed ? 'completed' : 'no-changes', changed, message: changed ? `Synchronization completed successfully — renewal found in the ERP, end date is now ${contract.endDate}. Refreshed the contract, ${scope}.` : `No changes found. Checked the contract, ${scope}.` };
  }

  /** Demo control for the automated schedule: runs the scheduled synchronization now. It does not move the next scheduled run (BR-CT-013). */
  runScheduledSync(): SyncRun {
    const started = new Date().toISOString();
    let updated = 0;
    let processed = 0;
    const next = this.store.contracts().map((c) => {
      processed += 1 + this.childrenOf(c).length;
      if (c.status === 'Cancelled') return c;
      const r = this.store.applyErpChanges(c);
      if (r.changed) {
        updated++;
        this.addChange(c, 'Contract end date', c.endDate, r.contract.endDate, 'Automated sync');
        this.addChange(c, 'Renewal status', c.renewalStatus ?? '—', r.contract.renewalStatus ?? '—', 'Automated sync');
      }
      return r.contract;
    });
    this.store.contracts.set(next);
    const run = this.addRun({ type: 'Automated', startedAt: started, finishedAt: new Date().toISOString(), initiatedBy: 'System Scheduler', processed, created: 0, updated, rejected: 0, errors: 0, status: updated ? 'Completed' : 'No Changes' });
    this.store.log('Contract Sync', 'Scheduled sync', `Automated sync: ${processed} records retrieved, ${updated} updated, 0 rejected, 0 errors. Records are matched on the ERP reference, so no duplicates are created.`, 'Success', 'System Scheduler', { syncType: 'Automated' });
    if (updated) this.store.notify(`Scheduled ERP sync updated ${updated} contract${updated > 1 ? 's' : ''}.`, 'Contracts & Budget', 'info', '/contracts-budget/sync-history');
    return run;
  }

  resolveError(id: string, note: string) {
    const e = this.errorLog().find((x) => x.id === id);
    if (!e) return;
    this.errorLog.update((l) => l.map((x) => (x.id === id ? { ...x, resolution: 'Resolved', resolutionNote: note, resolvedAt: new Date().toISOString() } : x)));
    this.store.log('Sync Error Resolved', e.contractReference, note || 'Marked as resolved.', 'Success', CURRENT_USER, { erpReference: e.erpReference, syncType: e.syncType, previousValue: e.resolution, newValue: 'Resolved' });
  }

  // ---------- templates ----------
  saveTemplate(t: Omit<NotificationTemplate, 'id'> & { id?: string }) {
    const id = t.id ?? 'T' + this.next();
    const exists = this.templates().some((x) => x.id === id);
    this.templates.update((l) => (exists ? l.map((x) => (x.id === id ? { ...t, id } : x)) : [...l, { ...t, id }]));
    this.store.log(exists ? 'Notification Template Updated' : 'Notification Template Created', t.name, `${t.purpose} template (${t.language}).`);
    return id;
  }

  deleteTemplate(id: string) {
    const t = this.templates().find((x) => x.id === id);
    this.templates.update((l) => l.filter((x) => x.id !== id));
    if (t) this.store.log('Notification Template Deleted', t.name, `${t.purpose} template (${t.language}) removed.`);
  }
}
