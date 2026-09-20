import { Injectable, computed, inject, signal } from '@angular/core';
import {
  Agent, AppNotification, AppUser, AuditEntry, BudgetLine, BudgetPlan, Candidate, CandidateStatus, Contract, IdDocument,
  InterviewQuestion, InvoiceRun, MovementAnnouncement, MovementRequest, NotificationRule, PayableLine,
  PayableRules, PaymentRecord, PerformanceRecord, SyncRun, WorkforceSnapshot,
} from '../models/domain';
import { StatusLevel, daysRemainingToLevel } from '../models/status';
import { MockDataService } from './mock-data.service';
import { NAV_GROUPS, NavGroup } from '../nav.config';

export const CURRENT_USER = 'Hamza Tarkan';
export const ROLE_SUMMARY: Record<string, string> = {
  'Contract Mgmt Team': 'Contracts, budgets and forecasts',
  'Budget Owner': 'Contracts and budget approval',
  'CSR/Workforce Team': 'Agents, leave, recruitment and movement',
  'Team Lead': 'Agents, leave and movement requests',
  'Finance': 'Contracts, budgets, invoices and payments',
  'System Admin': 'Everything, plus access control and audit',
};
export const ROLES = ['Contract Mgmt Team', 'Budget Owner', 'CSR/Workforce Team', 'Team Lead', 'Finance', 'System Admin'];

export interface Permission { permission: string; module: string; }
export const PERMISSIONS: Permission[] = [
  { permission: 'View Contracts', module: 'Contracts & Budget' },
  { permission: 'Manual Contract Sync', module: 'Contracts & Budget' },
  { permission: 'Prepare/Edit Draft Budget', module: 'Contracts & Budget' },
  { permission: 'Approve Budget', module: 'Contracts & Budget' },
  { permission: 'View Agent Profiles', module: 'CSR Management' },
  { permission: 'Manage Recruitment', module: 'CSR Management' },
  { permission: 'Manage Leave & Attendance', module: 'CSR Management' },
  { permission: 'Create Movement Announcement', module: 'Internal Project Movement' },
  { permission: 'Review/Approve Movement Requests', module: 'Internal Project Movement' },
  { permission: 'Validate Invoice', module: 'Invoicing & Payments' },
  { permission: 'Configure Payable Rules', module: 'Invoicing & Payments' },
];

export const INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  { id: 'q1', category: 'Communication', text: 'Explain a billing charge to a customer who is upset, in clear simple language.' },
  { id: 'q2', category: 'Communication', text: 'Spoken English and Arabic fluency (rate the candidate on both).' },
  { id: 'q3', category: 'Product knowledge', text: 'Describe the difference between prepaid, postpaid and Hayyak plans.' },
  { id: 'q4', category: 'Problem solving', text: 'A customer was charged twice. Walk through how you would resolve it.' },
  { id: 'q5', category: 'Customer handling', text: 'How would you handle a caller who refuses to accept the answer given?' },
  { id: 'q6', category: 'Customer handling', text: 'Give an example of staying calm during a high-volume shift.' },
  { id: 'q7', category: 'Reliability', text: 'Availability for shift patterns, weekends and overtime.' },
  { id: 'q8', category: 'Reliability', text: 'Comfort with system tools: typing speed, CRM navigation, note-taking.' },
];

const LEAVE_CODE_BY_TYPE: Record<string, string> = {
  'Sick Leave': 'S/L', 'Annual Leave': 'C/L', 'Study Leave': 'ST/L', 'Maternity Leave': 'M/L',
};
const LEAVE_TYPE_BY_CODE: Record<string, string> = {
  'S/L': 'Sick Leave', 'C/L': 'Annual Leave', 'ST/L': 'Study Leave', 'M/L': 'Maternity Leave',
  'P/L': 'Paternity Leave', 'SP': 'Compassionate Leave', 'AS': 'Accompanying Sick Family Member',
};

function isoDay(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

export function deriveContractStatus(daysRemaining: number): Contract['status'] {
  return daysRemaining < 0 ? 'Expired' : daysRemainingToLevel(daysRemaining) === 'normal' ? 'Active' : 'Expiring Soon';
}

export function timeAgo(ts: number): string {
  const min = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

/**
 * The single source of truth for the demo. Every screen reads from and writes to this store, so an
 * action on one screen (approve a request, hire a candidate, validate an invoice…) shows up on the
 * others, in the audit log and in the notification bell — the same behaviour the real system will have.
 */
@Injectable({ providedIn: 'root' })
export class CrcStore {
  private mock = inject(MockDataService);
  private seq = 100;

  // ---------- session ----------
  readonly currentRole = signal('System Admin');
  readonly permissionGrid = signal<Record<string, boolean>>(this.seedPermissions());

  // ---------- data ----------
  readonly contracts = signal<Contract[]>(this.mock.getContracts());
  readonly syncRuns = signal<SyncRun[]>([
    { id: 'S4', type: 'Automated', startedAt: isoDay(0) + 'T02:00:00', finishedAt: isoDay(0) + 'T02:04:00', initiatedBy: 'System Scheduler', processed: 214, created: 2, updated: 11, rejected: 0, status: 'Completed' },
    { id: 'S3', type: 'Manual', startedAt: isoDay(-1) + 'T14:22:00', finishedAt: isoDay(-1) + 'T14:22:40', initiatedBy: CURRENT_USER, processed: 1, created: 0, updated: 0, rejected: 0, status: 'No Changes' },
    { id: 'S2', type: 'Automated', startedAt: isoDay(-1) + 'T02:00:00', finishedAt: isoDay(-1) + 'T02:03:00', initiatedBy: 'System Scheduler', processed: 214, created: 0, updated: 4, rejected: 0, status: 'Completed' },
    { id: 'S1', type: 'Automated', startedAt: isoDay(-2) + 'T02:00:00', finishedAt: isoDay(-2) + 'T02:01:10', initiatedBy: 'System Scheduler', processed: 0, created: 0, updated: 0, rejected: 0, status: 'Failed' },
  ]);
  readonly notificationRules = signal<NotificationRule[]>([
    { id: '1', contractType: 'All Contracts', thresholdDays: 60, channel: 'Email', recipients: 'Contract Management Team', active: true },
    { id: '2', contractType: 'All Contracts', thresholdDays: 30, channel: 'Email + In-App', recipients: 'Contract Management Team', active: true },
    { id: '3', contractType: 'All Contracts', thresholdDays: 15, channel: 'Email + SMS + In-App', recipients: 'Contract Management Manager', active: true },
    { id: '4', contractType: 'Manpower Outsourcing', thresholdDays: 5, channel: 'SMS + In-App', recipients: 'Senior Management (Escalation)', active: true },
    { id: '5', contractType: 'IT Support', thresholdDays: 45, channel: 'Email', recipients: 'Procurement / Finance', active: false },
  ]);

  readonly budgetLines = signal<BudgetLine[]>(this.mock.getBudgetLines().filter((l) => l.category !== 'Total Budget'));
  readonly budgetPlan = signal<BudgetPlan>({ status: 'Draft', drafts: {} });

  readonly agents = signal<Agent[]>(this.mock.getAgents(48));
  readonly attendanceDays = Array.from({ length: 14 }, (_, i) => isoDay(i - 13));
  readonly attendance = signal<Record<string, string[]>>(this.seedAttendance());
  readonly idDocs = signal<Record<string, IdDocument>>(this.seedIdDocs());
  readonly snapshots: WorkforceSnapshot[] = this.mock.getWorkforceSnapshots();
  readonly candidates = signal<Candidate[]>(
    this.mock.getCandidates().map((c, i): Candidate => ({ ...c, status: i % 5 === 0 ? 'New' : c.status, score: i % 5 === 0 ? 0 : c.score })),
  );

  readonly announcements = signal<MovementAnnouncement[]>(this.mock.getMovementAnnouncements());
  readonly movementRequests = signal<MovementRequest[]>(this.seedMovementRequests());

  readonly payableRates: PayableLine[] = this.mock.getPayableLines();
  readonly payableRules = signal<PayableRules>({ thresholdSeconds: 10, deviationPct: 2, perVendor: false });
  readonly invoiceRuns = signal<Record<string, InvoiceRun>>({});
  readonly payments = signal<PaymentRecord[]>(this.mock.getPaymentRecords());

  readonly users = signal<AppUser[]>([
    { id: 'U1', name: 'Hamza Tarkan', email: 'hamza.tarkan@omantel.om', role: 'System Admin', active: true },
    { id: 'U2', name: 'Salim Al-Habsi', email: 'salim.alhabsi@omantel.om', role: 'Contract Mgmt Team', active: true },
    { id: 'U3', name: 'Mariam Al-Kindi', email: 'mariam.alkindi@omantel.om', role: 'Budget Owner', active: true },
    { id: 'U4', name: 'Khalid Al-Farsi', email: 'khalid.alfarsi@omantel.om', role: 'Finance', active: true },
    { id: 'U5', name: 'Noor Al-Rawahi', email: 'noor.alrawahi@omantel.om', role: 'CSR/Workforce Team', active: true },
    { id: 'U6', name: 'Talal Al-Amri', email: 'talal.alamri@omantel.om', role: 'Team Lead', active: false },
  ]);

  readonly audit = signal<AuditEntry[]>(this.mock.getAuditLog());
  readonly notifications = signal<AppNotification[]>([
    { id: 'N1', message: '3 contracts expiring within 15 days.', detail: 'Contracts & Budget', level: 'amber', createdAt: Date.now() - 12 * 60000, read: false, link: '/contracts-budget/contracts' },
    { id: 'N2', message: 'Petty cash budget at 96% of allocation.', detail: 'Budget', level: 'red', createdAt: Date.now() - 60 * 60000, read: false, link: '/contracts-budget/budget-breakdown' },
    { id: 'N3', message: 'Movement requests are pending your review.', detail: 'Internal Project Movement', level: 'info', createdAt: Date.now() - 3 * 3600000, read: false, link: '/movement/review' },
  ]);

  // ---------- derived ----------
  readonly budgetTotals = computed(() => {
    const lines = this.budgetLines();
    const allocated = lines.reduce((s, l) => s + l.allocated, 0);
    const spent = lines.reduce((s, l) => s + l.spent, 0);
    return { allocated, spent, remaining: allocated - spent, pct: allocated ? (spent / allocated) * 100 : 0 };
  });

  readonly budgetByCategory = computed(() => {
    const map = new Map<string, { allocated: number; spent: number }>();
    for (const l of this.budgetLines()) {
      const cur = map.get(l.category) ?? { allocated: 0, spent: 0 };
      map.set(l.category, { allocated: cur.allocated + l.allocated, spent: cur.spent + l.spent });
    }
    return [...map.entries()].map(([category, v]) => ({ category, ...v }));
  });

  readonly performance = computed<PerformanceRecord[]>(() => {
    const att = this.attendance();
    return this.agents().map((a) => {
      const codes = att[a.id] ?? [];
      const working = codes.filter((c) => c !== 'OFF');
      const present = working.filter((c) => c === 'P').length;
      const attendancePct = working.length ? Math.round((present / working.length) * 100) : 0;
      const h = hash(a.id);
      const csatPct = 45 + (h % 55);
      const score = (attendancePct + csatPct) / 2;
      return {
        agentId: a.id,
        agentName: a.name,
        queue: a.queue,
        vendor: a.vendor,
        attendancePct,
        avgCallResolutionMin: 3 + ((h >> 3) % 60) / 10,
        csatPct,
        level: (score >= 90 ? 'normal' : score >= 80 ? 'amber' : score >= 70 ? 'orange' : 'red') as StatusLevel,
      };
    });
  });

  readonly unreadCount = computed(() => this.notifications().filter((n) => !n.read).length);

  // ---------- permissions ----------
  can(permission: string): boolean {
    return this.permissionGrid()[`${permission}|${this.currentRole()}`] ?? false;
  }

  togglePermission(permission: string, role: string) {
    const key = `${permission}|${role}`;
    const next = !(this.permissionGrid()[key] ?? false);
    this.permissionGrid.update((g) => ({ ...g, [key]: next }));
    this.log('Permission Changed', permission, `${next ? 'Granted' : 'Revoked'} "${permission}" ${next ? 'to' : 'from'} ${role}.`);
  }

  setRole(role: string) {
    this.currentRole.set(role);
    this.log('Role Switched', role, `Viewing the portal as ${role} (demo role switch).`);
  }

  /** Shows a loading state while the role's screens and permissions are "loaded", then applies the role. */
  readonly roleSwitching = signal<string | null>(null);

  async switchRole(role: string): Promise<void> {
    if (role === this.currentRole() || this.roleSwitching()) return;
    this.roleSwitching.set(role);
    await new Promise((resolve) => setTimeout(resolve, 1300));
    this.setRole(role);
    this.roleSwitching.set(null);
  }

  /** Menu groups/items the current role may see — driven by the (editable) permission matrix. */
  readonly visibleGroups = computed<NavGroup[]>(() => {
    const role = this.currentRole();
    const grid = this.permissionGrid();
    const allowed = (perms?: string[]) => !perms || perms.some((p) => grid[`${p}|${role}`]);
    return NAV_GROUPS
      .filter((g) => !g.adminOnly || role === 'System Admin')
      .map((g) => ({ ...g, items: g.items.filter((i) => allowed(i.perms)) }))
      .filter((g) => g.items.length > 0);
  });

  readonly landingRoute = computed(() => {
    const g = this.visibleGroups()[0];
    return g ? `${g.basePath}/${g.items[0].path}` : '/contracts-budget/dashboard';
  });

  canAccessUrl(url: string): boolean {
    const path = url.split('?')[0].split('#')[0].replace(/\/$/, '');
    const owner = NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ full: `${g.basePath}/${i.path}`, group: g, item: i })))
      .find((x) => path === x.full || path.startsWith(x.full + '/'));
    if (!owner) return true;
    return this.visibleGroups().some((g) => g.basePath === owner.group.basePath && g.items.some((i) => i.path === owner.item.path));
  }

  addUser(u: Omit<AppUser, 'id' | 'active'>) {
    this.users.update((list) => [{ ...u, id: 'U' + this.next(), active: true }, ...list]);
    this.log('User Added', u.email, `${u.name} added with role ${u.role}.`);
  }

  updateUser(id: string, patch: Partial<AppUser>) {
    const before = this.users().find((u) => u.id === id);
    this.users.update((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    if (before) this.log('User Updated', before.email, `${before.name}: ${Object.keys(patch).map((k) => `${k} → ${(patch as any)[k]}`).join(', ')}.`);
  }

  // ---------- audit + notifications ----------
  log(activityType: string, reference: string, details: string, result: 'Success' | 'Failed' = 'Success', actor = CURRENT_USER) {
    const entry: AuditEntry = { id: 'AUD-' + this.next(), timestamp: new Date().toISOString(), actor, activityType, reference, result, details };
    this.audit.update((list) => [entry, ...list]);
  }

  notify(message: string, detail: string, level: AppNotification['level'] = 'info', link?: string) {
    this.notifications.update((list) => [{ id: 'N' + this.next(), message, detail, level, createdAt: Date.now(), read: false, link }, ...list]);
  }

  markAllRead() {
    this.notifications.update((list) => list.map((n) => ({ ...n, read: true })));
  }

  markRead(id: string) {
    this.notifications.update((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  // ---------- contracts ----------
  refreshContract(c: Contract): Contract {
    const daysRemaining = Math.round((new Date(c.endDate).getTime() - new Date(isoDay(0)).getTime()) / 86400000);
    return { ...c, daysRemaining, status: c.status === 'Cancelled' ? 'Cancelled' : deriveContractStatus(daysRemaining) };
  }

  /** A renewal that landed in the ERP: extends the end date. Only contracts flagged "Renewal in progress" change. */
  private applyErpChanges(c: Contract): { contract: Contract; changed: boolean } {
    if (c.renewalStatus === 'Renewal in progress' && c.daysRemaining < 30) {
      const end = new Date(c.endDate);
      end.setFullYear(end.getFullYear() + 1);
      return { contract: this.refreshContract({ ...c, endDate: end.toISOString().slice(0, 10), renewalStatus: 'Renewed', lastSyncedAt: new Date().toISOString() }), changed: true };
    }
    return { contract: { ...c, lastSyncedAt: new Date().toISOString() }, changed: false };
  }

  syncContract(id: string): { changed: boolean; message: string } {
    const current = this.contracts().find((c) => c.id === id);
    if (!current) return { changed: false, message: 'Contract not found.' };
    const { contract, changed } = this.applyErpChanges(current);
    this.contracts.update((list) => list.map((c) => (c.id === id ? contract : c)));
    const now = new Date().toISOString();
    this.syncRuns.update((runs) => [{ id: 'S' + this.next(), type: 'Manual', startedAt: now, finishedAt: now, initiatedBy: CURRENT_USER, processed: 1, created: 0, updated: changed ? 1 : 0, rejected: 0, status: changed ? 'Completed' : 'No Changes' }, ...runs]);
    this.log('Contract Sync', current.reference, changed ? `Manual sync: renewal found in ERP — end date extended to ${contract.endDate}.` : 'Manual sync: no changes found in the ERP.');
    if (changed) this.notify(`${current.reference} was renewed in the ERP.`, 'Contracts & Budget', 'info', '/contracts-budget/contracts/' + id);
    return { changed, message: changed ? `Renewal found in the ERP — end date is now ${contract.endDate}.` : 'Synchronization completed successfully — no changes found.' };
  }

  runFullSync(): SyncRun {
    const started = new Date().toISOString();
    let updated = 0;
    const next = this.contracts().map((c) => {
      const r = this.applyErpChanges(c);
      if (r.changed) updated++;
      return r.contract;
    });
    this.contracts.set(next);
    const run: SyncRun = { id: 'S' + this.next(), type: 'Manual', startedAt: started, finishedAt: new Date().toISOString(), initiatedBy: CURRENT_USER, processed: next.length, created: 0, updated, rejected: 0, status: updated ? 'Completed' : 'No Changes' };
    this.syncRuns.update((runs) => [run, ...runs]);
    this.log('Contract Sync', 'FULL-SYNC', `Full ERP sync: ${next.length} records processed, ${updated} updated, 0 rejected.`);
    if (updated) this.notify(`ERP sync updated ${updated} contract${updated > 1 ? 's' : ''}.`, 'Contracts & Budget', 'info', '/contracts-budget/sync-history');
    return run;
  }

  addNotificationRule(rule: Omit<NotificationRule, 'id' | 'active'>) {
    this.notificationRules.update((list) => [{ ...rule, id: 'R' + this.next(), active: true }, ...list]);
    this.log('Notification Rule Created', rule.contractType, `${rule.thresholdDays} days before expiry via ${rule.channel} to ${rule.recipients}.`);
  }

  toggleNotificationRule(id: string) {
    let r: NotificationRule | undefined;
    this.notificationRules.update((list) => list.map((x) => (x.id === id ? (r = { ...x, active: !x.active }) : x)));
    if (r) this.log('Notification Rule Updated', r.contractType, `${r.thresholdDays}-day rule ${r.active ? 'activated' : 'deactivated'}.`);
  }

  deleteNotificationRule(id: string) {
    const r = this.notificationRules().find((x) => x.id === id);
    this.notificationRules.update((list) => list.filter((x) => x.id !== id));
    if (r) this.log('Notification Rule Deleted', r.contractType, `${r.thresholdDays}-day rule removed.`);
  }

  // ---------- budget ----------
  readonly nextYearTotal = computed(() => {
    const drafts = this.budgetPlan().drafts;
    return this.budgetLines().reduce((s, l) => s + (drafts[l.id] ?? Math.round(l.allocated * 1.03)), 0);
  });

  setDraft(lineId: string, value: number) {
    this.budgetPlan.update((p) => ({ ...p, status: p.status === 'Approved' ? p.status : 'Draft', drafts: { ...p.drafts, [lineId]: value } }));
  }

  regenerateDraft() {
    this.budgetPlan.set({ status: 'Draft', drafts: {} });
    this.log('Budget Draft Regenerated', 'FY-NEXT', 'Draft regenerated at 3% above the prior approved budget.');
  }

  submitBudget() {
    this.budgetPlan.update((p) => ({ ...p, status: 'Submitted', submittedAt: new Date().toISOString() }));
    this.log('Budget Submitted', 'FY-NEXT', `Next-year budget of ${Math.round(this.nextYearTotal()).toLocaleString()} OMR submitted for approval.`);
    this.notify('Next-year budget is waiting for approval.', 'Budget', 'info', '/contracts-budget/budget-preparation');
  }

  decideBudget(approved: boolean, note = '') {
    this.budgetPlan.update((p) => ({ ...p, status: approved ? 'Approved' : 'Rejected', decidedAt: new Date().toISOString(), decisionNote: note }));
    this.log(approved ? 'Budget Approved' : 'Budget Rejected', 'FY-NEXT', note || (approved ? 'Approved as submitted.' : 'Returned to the budget preparer.'));
    this.notify(`Next-year budget was ${approved ? 'approved' : 'rejected'}.`, 'Budget', approved ? 'green' : 'red', '/contracts-budget/budget-preparation');
  }

  // ---------- CSR ----------
  addAgent(a: { name: string; queue: string; vendor: Agent['vendor']; degree: Agent['degree']; nationality: string }) {
    const n = this.next();
    const agent: Agent = { id: 'AG-' + (3000 + n), employeeId: String(4000 + n), name: a.name, queue: a.queue, vendor: a.vendor, degree: a.degree, nationality: a.nationality || 'Oman', joinDate: isoDay(0), status: 'Present' };
    this.agents.update((list) => [agent, ...list]);
    this.attendance.update((att) => ({ ...att, [agent.id]: this.attendanceDays.map((d) => (new Date(d).getDay() >= 5 ? 'OFF' : 'P')) }));
    this.log('Agent Added', agent.employeeId, `${agent.name} added to ${agent.queue} (${agent.vendor}).`);
    return agent;
  }

  setAttendance(agentId: string, dayIndex: number, code: string) {
    this.attendance.update((att) => {
      const row = [...(att[agentId] ?? [])];
      row[dayIndex] = code;
      return { ...att, [agentId]: row };
    });
    if (dayIndex === this.attendanceDays.length - 1) this.syncAgentStatusFromCode(agentId, code);
  }

  /** Leave override by the CSR team (does not alter the source WFO record). Applies to today. */
  recordLeave(agentId: string, code: string, note = '') {
    this.setAttendance(agentId, this.attendanceDays.length - 1, code);
    const a = this.agents().find((x) => x.id === agentId);
    if (a) this.log('Leave Override', a.employeeId, `${a.name}: today reclassified to ${code}${note ? ' — ' + note : ''}.`);
  }

  private syncAgentStatusFromCode(agentId: string, code: string) {
    const status: Agent['status'] = code === 'P' ? 'Present' : code === 'OFF' ? 'Off' : code === 'A' ? 'Absent' : 'On Leave';
    this.agents.update((list) => list.map((a) => (a.id === agentId ? { ...a, status, leaveType: status === 'On Leave' ? LEAVE_TYPE_BY_CODE[code] : undefined } : a)));
  }

  /** ID upload: the file is "read" (OCR simulated), then a person confirms the extracted values. */
  uploadId(agentId: string, fileName: string) {
    this.idDocs.update((m) => ({ ...m, [agentId]: { fileName, status: 'Processing' } }));
    const a = this.agents().find((x) => x.id === agentId);
    if (a) this.log('ID Uploaded', a.employeeId, `${fileName} uploaded for ${a.name}; OCR started.`);
  }

  finishOcr(agentId: string) {
    const a = this.agents().find((x) => x.id === agentId);
    const doc = this.idDocs()[agentId];
    if (!a || !doc) return;
    const h = hash(agentId + doc.fileName);
    this.idDocs.update((m) => ({ ...m, [agentId]: { ...doc, status: 'Extracted', name: a.name, idNumber: String(10000000 + (h % 89999999)), expiry: `${new Date().getFullYear() + 2 + (h % 5)}-0${1 + (h % 9)}-1${h % 9}` } }));
  }

  verifyId(agentId: string) {
    const doc = this.idDocs()[agentId];
    const a = this.agents().find((x) => x.id === agentId);
    if (!doc || !a) return;
    this.idDocs.update((m) => ({ ...m, [agentId]: { ...doc, status: 'Verified' } }));
    this.log('ID Verified', a.employeeId, `${a.name}: extracted name and ID number confirmed.`);
  }

  private seedIdDocs(): Record<string, IdDocument> {
    const out: Record<string, IdDocument> = {};
    this.agents().slice(0, 30).forEach((a) => {
      const h = hash(a.id);
      out[a.id] = { fileName: `${a.employeeId}-id-card.jpg`, status: 'Verified', name: a.name, idNumber: String(10000000 + (h % 89999999)), expiry: `${new Date().getFullYear() + 2 + (h % 5)}-0${1 + (h % 9)}-1${h % 9}` };
    });
    return out;
  }

  // recruitment
  attachCv(id: string, fileName: string) {
    this.candidates.update((list) => list.map((c) => (c.id === id ? { ...c, cv: fileName } : c)));
    this.log('CV Uploaded', id, fileName);
  }

  addCandidate(c: { name: string; vendor: string; department: string }) {
    const cand: Candidate = { id: 'CAND-' + this.next(), name: c.name, vendor: c.vendor, department: c.department, appliedDate: isoDay(0), score: 0, maxScore: 100, status: 'New' };
    this.candidates.update((list) => [cand, ...list]);
    this.log('Candidate Added', cand.id, `${cand.name} applied for ${cand.department} via ${cand.vendor}.`);
  }

  scheduleInterview(id: string, date: string, time: string, interviewer: string) {
    let name = '';
    this.candidates.update((list) => list.map((c) => {
      if (c.id !== id) return c;
      name = c.name;
      return { ...c, status: 'Interview Scheduled', interview: { date, time, interviewer, scores: c.interview?.scores ?? {}, notes: c.interview?.notes ?? '', completed: false } };
    }));
    this.log('Interview Scheduled', id, `${name}: ${date} ${time} with ${interviewer}.`);
    this.notify(`Interview scheduled for ${name}.`, 'Recruitment', 'info', '/csr/recruitment');
  }

  saveInterviewScores(id: string, scores: Record<string, number>, notes: string) {
    const total = Object.values(scores).reduce((s, v) => s + v, 0);
    const score = Math.round((total / (INTERVIEW_QUESTIONS.length * 5)) * 100);
    let name = '';
    this.candidates.update((list) => list.map((c) => {
      if (c.id !== id) return c;
      name = c.name;
      return { ...c, score, maxScore: 100, interview: { date: c.interview?.date ?? isoDay(0), time: c.interview?.time ?? '', interviewer: c.interview?.interviewer ?? CURRENT_USER, scores, notes, completed: true } };
    }));
    this.log('Interview Scored', id, `${name} scored ${score}/100.`);
    return score;
  }

  decideCandidate(id: string, status: Extract<CandidateStatus, 'Shortlisted' | 'Rejected' | 'Hired'>) {
    const cand = this.candidates().find((c) => c.id === id);
    if (!cand) return;
    this.candidates.update((list) => list.map((c) => (c.id === id ? { ...c, status } : c)));
    this.log(`Candidate ${status}`, id, `${cand.name} marked ${status}.`);
    if (status === 'Hired') {
      const vendor: Agent['vendor'] = cand.vendor.startsWith('Green') ? 'Green Umbrella' : 'Infoline';
      const agent = this.addAgent({ name: cand.name, queue: cand.department, vendor, degree: 'Diploma', nationality: 'Oman' });
      this.notify(`${cand.name} was hired and added to the directory.`, 'Recruitment', 'green', '/csr/directory/' + agent.id);
    }
  }

  // ---------- movement ----------
  addAnnouncement(a: { projectName: string; targetQueue: string; durationMonths: number; skills: string[] }) {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 14);
    const ann: MovementAnnouncement = { id: 'MV-' + this.next(), projectName: a.projectName, targetQueue: a.targetQueue, durationMonths: a.durationMonths, skillsRequired: a.skills, applicants: 0, status: 'Open', postedDate: isoDay(0), deadline: deadline.toISOString().slice(0, 10) };
    this.announcements.update((list) => [ann, ...list]);
    this.log('Movement Announced', ann.id, `${ann.projectName} (${ann.targetQueue}, ${ann.durationMonths} months) posted.`);
    this.notify(`New movement opportunity: ${ann.projectName}.`, 'Internal Project Movement', 'info', '/movement/apply?announcement=' + ann.id);
    return ann;
  }

  toggleAnnouncement(id: string) {
    let a: MovementAnnouncement | undefined;
    this.announcements.update((list) => list.map((x) => (x.id === id ? (a = { ...x, status: x.status === 'Open' ? 'Closed' : 'Open' }) : x)));
    if (a) this.log(`Movement ${a.status === 'Open' ? 'Reopened' : 'Closed'}`, a.id, a.projectName);
  }

  submitApplication(app: { announcementId: string; agentId: string; contact: string; duration: number; justification: string }): MovementRequest | undefined {
    const ann = this.announcements().find((a) => a.id === app.announcementId);
    const agent = this.agents().find((a) => a.employeeId === app.agentId || a.id === app.agentId);
    if (!ann || !agent) return undefined;
    const start = new Date();
    start.setDate(start.getDate() + 14);
    const end = new Date(start);
    end.setMonth(end.getMonth() + app.duration);
    const req: MovementRequest = { id: 'MR-' + this.next(), agentName: agent.name, agentId: agent.id, project: ann.projectName, announcementId: ann.id, startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), status: 'Pending', justification: app.justification, contact: app.contact, previousQueue: agent.queue };
    this.movementRequests.update((list) => [req, ...list]);
    this.announcements.update((list) => list.map((a) => (a.id === ann.id ? { ...a, applicants: a.applicants + 1 } : a)));
    this.log('Movement Application', req.id, `${agent.name} applied to ${ann.projectName} for ${app.duration} month(s).`);
    this.notify(`${agent.name} applied to ${ann.projectName}.`, 'Internal Project Movement', 'info', '/movement/review');
    return req;
  }

  decideRequest(id: string, approved: boolean, note = '') {
    const req = this.movementRequests().find((r) => r.id === id);
    if (!req) return;
    this.movementRequests.update((list) => list.map((r) => (r.id === id ? { ...r, status: approved ? 'Active' : 'Rejected', decisionNote: note } : r)));
    if (approved && req.agentId) {
      const ann = this.announcements().find((a) => a.id === req.announcementId);
      if (ann) this.agents.update((list) => list.map((a) => (a.id === req.agentId ? { ...a, queue: ann.targetQueue } : a)));
    }
    this.log(approved ? 'Movement Approved' : 'Movement Rejected', id, `${req.agentName} → ${req.project}${note ? ' — ' + note : ''}.`);
    this.notify(`${req.agentName}'s movement request was ${approved ? 'approved' : 'rejected'}.`, 'Internal Project Movement', approved ? 'green' : 'red', '/movement/dashboard');
  }

  // ---------- invoicing ----------
  private rateFor(degree: Agent['degree']): number {
    return this.payableRates.find((r) => r.degree === degree)?.billingRate ?? 0;
  }

  /** Payable calculation for a vendor: billing rate × billable-day ratio per agent, plus 3 Clicks incentive on eligible calls. */
  calculateInvoice(vendorName: string) {
    const key: Agent['vendor'] = vendorName.startsWith('Green') ? 'Green Umbrella' : 'Infoline';
    const att = this.attendance();
    const agents = this.agents().filter((a) => a.vendor === key);
    const tiers = (['Bachelor', 'Diploma', 'Non-Diploma'] as const).map((degree) => {
      const group = agents.filter((a) => a.degree === degree);
      const rate = this.rateFor(degree);
      let factorSum = 0;
      for (const a of group) {
        const codes = att[a.id] ?? [];
        const expected = codes.filter((c) => c !== 'OFF').length;
        const billable = codes.filter((c) => c !== 'OFF' && c !== 'A').length;
        factorSum += expected ? billable / expected : 0;
      }
      return { degree, headcount: group.length, rate, billableFte: factorSum, amount: rate * factorSum };
    });
    const base = tiers.reduce((s, t) => s + t.amount, 0);
    const threshold = this.payableRules().thresholdSeconds;
    const sampleCalls = agents.length * 260;
    const excludedCalls = Math.round(sampleCalls * Math.min(0.6, threshold / 60));
    const eligibleCalls = sampleCalls - excludedCalls;
    const incentive = Math.round(eligibleCalls * 0.05 * 100) / 100;
    const subtotal = base + incentive;
    const vat = subtotal * 0.05;
    return { vendorName, tiers, base, sampleCalls, excludedCalls, eligibleCalls, incentive, subtotal, vat, total: subtotal + vat, threshold };
  }

  validateInvoice(vendorName: string, vendorAmount: number) {
    const calc = this.calculateInvoice(vendorName);
    const variancePct = calc.total ? ((vendorAmount - calc.total) / calc.total) * 100 : 0;
    const flagged = Math.abs(variancePct) > this.payableRules().deviationPct;
    const run: InvoiceRun = { vendor: vendorName, period: this.period(), calculatedTotal: calc.total, vendorInvoiceAmount: vendorAmount, variancePct, status: flagged ? 'Flagged for review' : 'Validated' };
    this.invoiceRuns.update((m) => ({ ...m, [vendorName]: run }));
    this.log(flagged ? 'Invoice Flagged' : 'Invoice Validated', vendorName, `Vendor invoice ${vendorAmount.toFixed(2)} vs calculated ${calc.total.toFixed(2)} OMR (${variancePct >= 0 ? '+' : ''}${variancePct.toFixed(2)}%).`);
    if (flagged) this.notify(`${vendorName} invoice deviates ${variancePct.toFixed(1)}% from the calculation.`, 'Invoicing & Payments', 'amber', '/invoicing/reconciliation');
    return run;
  }

  approveInvoice(vendorName: string) {
    const run = this.invoiceRuns()[vendorName];
    if (!run || !run.vendorInvoiceAmount) return;
    const payment: PaymentRecord = { id: 'PAY-' + this.next(), vendorName, invoiceAmount: Math.round(run.vendorInvoiceAmount), status: 'Pending', slaAtRisk: false, invoiceRef: 'INV-' + this.next(), period: run.period };
    this.payments.update((list) => [payment, ...list]);
    this.invoiceRuns.update((m) => ({ ...m, [vendorName]: { ...run, status: 'Approved for payment', paymentId: payment.id } }));
    this.log('Invoice Approved', vendorName, `Approved for payment: ${payment.invoiceAmount.toLocaleString()} OMR (${payment.id}).`);
    this.notify(`${vendorName} invoice approved for payment.`, 'Invoicing & Payments', 'green', '/invoicing/tracking');
    return payment;
  }

  movePayment(id: string, status: PaymentRecord['status']) {
    const p = this.payments().find((x) => x.id === id);
    if (!p || p.status === status) return;
    this.payments.update((list) => list.map((x) => (x.id === id ? { ...x, status, slaAtRisk: status === 'Completed' ? false : x.slaAtRisk, paymentDate: status === 'Completed' ? isoDay(0) : undefined } : x)));
    this.log('Payment Status Changed', id, `${p.vendorName}: ${p.status} → ${status}.`);
    if (status === 'Completed') {
      // paid amounts count as actual spend against the Outsourcing budget lines
      const out = this.budgetLines().filter((l) => l.category === 'Outsourcing');
      const totalAlloc = out.reduce((s, l) => s + l.allocated, 0);
      this.budgetLines.update((lines) => lines.map((l) => (l.category === 'Outsourcing' ? { ...l, spent: l.spent + Math.round((p.invoiceAmount * l.allocated) / totalAlloc) } : l)));
      this.notify(`Payment to ${p.vendorName} completed.`, 'Invoicing & Payments', 'green', '/invoicing/dashboard');
    }
  }

  savePayableRules(rules: PayableRules) {
    this.payableRules.set(rules);
    this.invoiceRuns.set({});
    this.log('Payable Rules Saved', 'PAYABLE-RULES', `Min call duration ${rules.thresholdSeconds}s, deviation review ${rules.deviationPct}%${rules.perVendor ? ', per-vendor' : ''}. Invoices must be re-validated.`);
  }

  period(): string {
    return new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  }

  // ---------- internals ----------
  private next() {
    return ++this.seq;
  }

  private seedPermissions(): Record<string, boolean> {
    const granted = (p: Permission, role: string): boolean => {
      if (role === 'System Admin') return true;
      if (p.permission === 'Approve Budget') return role === 'Budget Owner';
      if (p.module === 'Contracts & Budget') return role === 'Contract Mgmt Team' || role === 'Budget Owner' || role === 'Finance';
      if (p.module === 'CSR Management') return role === 'CSR/Workforce Team' || role === 'Team Lead';
      if (p.module === 'Internal Project Movement') return role === 'Team Lead' || role === 'CSR/Workforce Team';
      if (p.module === 'Invoicing & Payments') return role === 'Finance';
      return false;
    };
    const grid: Record<string, boolean> = {};
    for (const p of PERMISSIONS) for (const r of ROLES) grid[`${p.permission}|${r}`] = granted(p, r);
    return grid;
  }

  private seedAttendance(): Record<string, string[]> {
    const rec: Record<string, string[]> = {};
    const agents = this.agents();
    agents.forEach((a, i) => {
      rec[a.id] = this.attendanceDays.map((day, d) => {
        if (new Date(day).getDay() >= 5) return 'OFF';
        const last = d === this.attendanceDays.length - 1;
        if (a.status === 'On Leave' && d >= this.attendanceDays.length - 3) return LEAVE_CODE_BY_TYPE[a.leaveType ?? ''] ?? 'C/L';
        if (a.status === 'Absent' && last) return 'A';
        if (a.status === 'Off' && last) return 'OFF';
        if ((i * 7 + d * 3) % 23 === 0) return 'S/L';
        return 'P';
      });
    });
    return rec;
  }

  private seedMovementRequests(): MovementRequest[] {
    const agents = this.agents();
    const anns = this.announcements();
    return this.mock.getMovementRequests().map((r, i) => {
      const agent = agents[(i * 5 + 2) % agents.length];
      const ann = anns[i % anns.length];
      return { ...r, agentName: agent.name, agentId: agent.id, project: ann.projectName, announcementId: ann.id, previousQueue: agent.queue, justification: 'Interested in broadening skills and supporting the project.', contact: agent.employeeId };
    });
  }
}
