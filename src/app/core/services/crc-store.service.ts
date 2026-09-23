import { Injectable, computed, inject, signal } from '@angular/core';
import {
  Agent, AnnexureImport, AppNotification, AppUser, AuditEntry, BudgetLine, Candidate, CandidateStatus, Contract, IdDocument,
  InterviewQuestion, InvoiceLineDetail, InvoiceRun, MovementAnnouncement, MovementRequest, NotificationRule, PayableLine,
  PayableRules, PaymentRecord, PayrollLine, PerformanceRecord, ResignationRecord, SyncRun, VendorQuery, WorkforceSnapshot,
} from '../models/domain';
import { StatusLevel, daysRemainingToLevel } from '../models/status';
import { MockDataService } from './mock-data.service';
import { NAV_GROUPS, NavGroup } from '../nav.config';
import { attachmentsFor, childRecordsFor, enrichContract, timelineFor } from './contract-data';
import { seedChanges } from './contract-monitoring';

export const CURRENT_USER = 'Hamza Tarkan';
/** The contract's flat management fee per employee per month (OMR). */
export const FLAT_MANAGEMENT_FEE = 116;
export const ROLE_SUMMARY: Record<string, string> = {
  'Contract Mgmt Team': 'Contracts, budgets and forecasts',
  'Contract Mgmt Manager': 'Contract risk, escalations and notification rules',
  'Budget Owner': 'Contracts and budget approval',
  'Line Manager': 'Adds and updates their own project requests and views past submissions',
  'Project Manager': 'Project budget requests and their head count',
  'Budget Team': 'Receives and reviews the submitted budget and team forecasts',
  'Finance': 'Budgets, invoices, payments and the accrual forecast',
  'Read-Only User': 'Views authorized contracts, budgets, projects and forecasts, without changing anything',
  'System Admin': 'Everything, plus access control and audit',
};
export const ROLES = ['Contract Mgmt Team', 'Contract Mgmt Manager', 'Budget Owner', 'Line Manager', 'Project Manager', 'Finance', 'Budget Team', 'Read-Only User', 'System Admin'];

export interface Permission { permission: string; module: string; }
export const PERMISSIONS: Permission[] = [
  { permission: 'View Contracts', module: 'Contracts & Budget' },
  { permission: 'View Contract Details', module: 'Contracts & Budget' },
  { permission: 'Manual Contract Sync', module: 'Contracts & Budget' },
  { permission: 'View Sync History', module: 'Contracts & Budget' },
  { permission: 'View Attachments', module: 'Contracts & Budget' },
  { permission: 'View Dashboards', module: 'Contracts & Budget' },
  { permission: 'Export Contract Data', module: 'Contracts & Budget' },
  { permission: 'Manage Sync Configuration', module: 'Contracts & Budget' },
  { permission: 'Manage Notifications', module: 'Contracts & Budget' },
  { permission: 'Manage Escalations', module: 'Contracts & Budget' },
  { permission: 'Manage Monitoring Actions', module: 'Contracts & Budget' },
  { permission: 'View Audit History', module: 'Contracts & Budget' },
  { permission: 'Prepare/Edit Draft Budget', module: 'Contracts & Budget' },
  { permission: 'View Budget', module: 'Contracts & Budget' },
  { permission: 'Manage Budget Cycle', module: 'Contracts & Budget' },
  { permission: 'Submit Project Requests', module: 'Contracts & Budget' },
  { permission: 'Approve Projects', module: 'Contracts & Budget' },
  { permission: 'View Accrual Forecast', module: 'Forecast' },
  { permission: 'Edit Accrual Forecast', module: 'Forecast' },
  { permission: 'Close Forecast Period', module: 'Forecast' },
  { permission: 'Export Forecast', module: 'Forecast' },
  { permission: 'Configure Forecast', module: 'Forecast' },
  { permission: 'View Team Forecast', module: 'Forecast' },
  { permission: 'Export Team Forecast', module: 'Forecast' },
  { permission: 'View Agent Profiles', module: 'CSR Management' },
  { permission: 'Manage Recruitment', module: 'CSR Management' },
  { permission: 'View Employee Salary', module: 'CSR Management' },
  { permission: 'Manage Leave & Attendance', module: 'CSR Management' },
  { permission: 'Create Movement Announcement', module: 'Internal Project Movement' },
  { permission: 'Review/Approve Movement Requests', module: 'Internal Project Movement' },
  { permission: 'Validate Invoice', module: 'Invoicing & Payments' },
  { permission: 'Configure Payable Rules', module: 'Invoicing & Payments' },
];

/** Who holds the permissions whose default (the whole module) does not fit. Finance is not a Contract Tracking actor. */
const CT_ROLES = ['Contract Mgmt Team', 'Contract Mgmt Manager', 'Budget Owner'];
const RO = 'Read-Only User';
const SPECIAL: Record<string, string[]> = {
  'View Contracts': [...CT_ROLES, RO], 'View Contract Details': [...CT_ROLES, RO], 'View Sync History': CT_ROLES, 'View Attachments': [...CT_ROLES, RO], 'View Dashboards': [...CT_ROLES, RO], 'Export Contract Data': CT_ROLES,
  'View Budget': ['Contract Mgmt Team', 'Contract Mgmt Manager', 'Budget Owner', 'Finance', 'Budget Team', 'Read-Only User'],
  'Prepare/Edit Draft Budget': ['Contract Mgmt Team', 'Budget Owner'],
  'Manage Budget Cycle': ['Budget Owner', 'Contract Mgmt Manager'],
  'Submit Project Requests': ['Line Manager', 'Project Manager'],
  'Approve Projects': ['Budget Owner'],
  'View Accrual Forecast': ['Finance', 'Contract Mgmt Team', 'Contract Mgmt Manager', 'Budget Owner', 'Budget Team', RO],
  'Edit Accrual Forecast': ['Contract Mgmt Team', 'Contract Mgmt Manager'],
  'Configure Forecast': ['Contract Mgmt Manager'],
  'Close Forecast Period': ['Finance'],
  'Export Forecast': ['Finance', 'Contract Mgmt Team', 'Contract Mgmt Manager'],
  'View Team Forecast': ['Contract Mgmt Team', 'Contract Mgmt Manager', 'Budget Owner', 'Budget Team', RO],
  'Export Team Forecast': ['Contract Mgmt Team', 'Contract Mgmt Manager'],
};

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
  readonly contracts = signal<Contract[]>(this.mock.getContracts().map(enrichContract));
  readonly syncRuns = signal<SyncRun[]>([
    { id: 'S5', type: 'Manual', startedAt: isoDay(0) + 'T03:29:00', finishedAt: isoDay(0) + 'T03:30:00', initiatedBy: CURRENT_USER, processed: 1, created: 0, updated: 0, errors: 1, contractReference: '2025-013T-00-04', errorMessage: 'The ERP did not respond within 60 seconds (HTTP 504). Last synchronized data was kept.', status: 'Failed' },
    { id: 'S4', type: 'Automated', startedAt: isoDay(0) + 'T02:00:00', finishedAt: isoDay(0) + 'T02:04:00', initiatedBy: 'System Scheduler', processed: 214, created: 2, updated: 11, status: 'Completed' },
    { id: 'S3', type: 'Manual', startedAt: isoDay(-1) + 'T14:22:00', finishedAt: isoDay(-1) + 'T14:22:40', initiatedBy: CURRENT_USER, processed: 1, created: 0, updated: 0, errors: 0, contractReference: '2025-013T-00-02', status: 'No Changes' },
    { id: 'S2', type: 'Automated', startedAt: isoDay(-1) + 'T02:00:00', finishedAt: isoDay(-1) + 'T02:03:00', initiatedBy: 'System Scheduler', processed: 214, created: 0, updated: 4, errors: 1, errorMessage: 'Record rejected: end date is earlier than the start date (BR-CT-003).', status: 'Completed' },
    { id: 'S1', type: 'Automated', startedAt: isoDay(-2) + 'T02:00:00', finishedAt: isoDay(-2) + 'T02:01:10', initiatedBy: 'System Scheduler', processed: 0, created: 0, updated: 0, errors: 1, errorMessage: 'ERP endpoint returned HTTP 503 (Service Unavailable). Last synchronized data was retained.', status: 'Failed' },
  ]);
  readonly notificationRules = signal<NotificationRule[]>([
    { id: '1', contractType: 'All Contracts', thresholdDays: 60, channel: 'Email', recipients: 'Contract owner, Contract Management team', active: true, templateId: 'T1', language: 'English', vendor: 'All vendors', department: 'All departments' },
    { id: '2', contractType: 'All Contracts', thresholdDays: 30, channel: 'Email', recipients: 'Contract owner, Contract Management team', active: true, templateId: 'T1', language: 'English', vendor: 'All vendors', department: 'All departments' },
    { id: '3', contractType: 'All Contracts', thresholdDays: 15, channel: 'Email + SMS', recipients: 'Contract Management Manager, Responsible department', active: true, templateId: 'T1', language: 'English', vendor: 'All vendors', department: 'All departments' },
    { id: '4', contractType: 'All Contracts', thresholdDays: 5, channel: 'Email + SMS', recipients: 'Contract Management Manager, Senior management', active: true, templateId: 'T1', language: 'English', vendor: 'All vendors', department: 'All departments' },
    { id: '5', contractType: 'IT Support', thresholdDays: 45, channel: 'Email', recipients: 'Procurement team, Finance team', active: false, templateId: 'T1', language: 'English', vendor: 'All vendors', department: 'All departments' },
  ]);

  readonly budgetLines = signal<BudgetLine[]>(this.mock.getBudgetLines().filter((l) => l.category !== 'Total Budget'));
  /** Manual override of a Yearly Budget line's approved amount, keyed by "contractId:Y<year>:L<line>". Not read from the ERP. */
  readonly yearlyBudgetApprovals = signal<Record<string, number>>({});

  readonly agents = signal<Agent[]>(this.mock.getAgents(48));
  readonly attendanceDays = signal<string[]>(Array.from({ length: 14 }, (_, i) => isoDay(i - 13)));
  readonly attendance = signal<Record<string, string[]>>(this.seedAttendance());
  readonly idDocs = signal<Record<string, IdDocument>>(this.seedIdDocs());
  readonly snapshots: WorkforceSnapshot[] = this.mock.getWorkforceSnapshots();
  readonly candidates = signal<Candidate[]>(
    this.mock.getCandidates().map((c, i): Candidate => ({ ...c, status: i % 5 === 0 ? 'New' : c.status, score: i % 5 === 0 ? 0 : c.score })),
  );

  readonly announcements = signal<MovementAnnouncement[]>(this.mock.getMovementAnnouncements());
  readonly movementRequests = signal<MovementRequest[]>(this.seedMovementRequests());

  readonly payableRates: PayableLine[] = this.mock.getPayableLines();
  /** First day of the billing month; the workbook import sets it from the invoice date. */
  readonly periodStart = signal(new Date().toISOString().slice(0, 7) + '-01');
  readonly payroll = signal<Record<string, PayrollLine>>(this.seedPayroll());
  readonly resignations = signal<ResignationRecord[]>(this.seedResignations());
  readonly importInfo = signal<{ fileName: string; employees: number; days: number; resignations: number; period: string } | null>(null);
  readonly payableRules = signal<PayableRules>({ thresholdSeconds: 10, deviationPct: 2, perVendor: false, includeIncentive: false });
  /** Every validate/approve pass, per vendor, oldest first — a vendor can have several, one per subset of lines paid over time. */
  readonly invoiceRuns = signal<Record<string, InvoiceRun[]>>({});
  readonly payments = signal<PaymentRecord[]>(this.mock.getPaymentRecords());
  /** Emails sent to a vendor querying a line where they invoiced more than the calculation — simulated, not a real mailbox. */
  readonly vendorQueries = signal<VendorQuery[]>([]);

  readonly users = signal<AppUser[]>([
    { id: 'U1', name: 'Hamza Tarkan', email: 'hamza.tarkan@omantel.om', role: 'System Admin', active: true },
    { id: 'U2', name: 'Salim Al-Habsi', email: 'salim.alhabsi@omantel.om', role: 'Contract Mgmt Team', active: true },
    { id: 'U3', name: 'Mariam Al-Kindi', email: 'mariam.alkindi@omantel.om', role: 'Budget Owner', active: true },
    { id: 'U4', name: 'Khalid Al-Farsi', email: 'khalid.alfarsi@omantel.om', role: 'Finance', active: true },
    { id: 'U5', name: 'Noor Al-Rawahi', email: 'noor.alrawahi@omantel.om', role: 'Project Manager', active: true },
    { id: 'U6', name: 'Talal Al-Amri', email: 'talal.alamri@omantel.om', role: 'Line Manager', active: false },
  ]);

  readonly audit = signal<AuditEntry[]>(this.seedAudit());
  readonly notifications = signal<AppNotification[]>([
    { id: 'N1', message: '3 contracts expiring within 15 days.', detail: 'Contracts & Budget', level: 'amber', createdAt: Date.now() - 12 * 60000, read: false, link: '/contracts-budget/contracts' },
    { id: 'N2', message: 'Petty cash budget at 96% of allocation.', detail: 'Budget', level: 'red', createdAt: Date.now() - 60 * 60000, read: false, link: '/contracts-budget/forecast' },
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
      .filter((g) => !g.hidden && (!g.adminOnly || role === 'System Admin'))
      .map((g) => ({ ...g, items: g.items.filter((i) => !i.hidden && allowed(i.perms)) }))
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
  log(activityType: string, reference: string, details: string, result: 'Success' | 'Failed' = 'Success', actor = CURRENT_USER, extra: Partial<AuditEntry> = {}) {
    const entry: AuditEntry = { id: 'AUD-' + this.next(), timestamp: new Date().toISOString(), actor, activityType, reference, result, details, ...extra };
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
  applyErpChanges(c: Contract): { contract: Contract; changed: boolean } {
    if (c.renewalStatus === 'Renewal in progress' && c.daysRemaining < 30) {
      const end = new Date(c.endDate);
      end.setFullYear(end.getFullYear() + 1);
      return { contract: this.refreshContract({ ...c, endDate: end.toISOString().slice(0, 10), renewalStatus: 'Renewed', lastSyncedAt: new Date().toISOString() }), changed: true };
    }
    return { contract: { ...c, lastSyncedAt: new Date().toISOString() }, changed: false };
  }

  addNotificationRule(rule: Omit<NotificationRule, 'id' | 'active'>) {
    this.notificationRules.update((list) => [{ ...rule, id: 'R' + this.next(), active: true }, ...list]);
    this.log('Notification Rule Created', rule.contractType, `${rule.thresholdDays} days before expiry via ${rule.channel} to ${rule.recipients}.`);
  }

  updateNotificationRule(id: string, patch: Partial<NotificationRule>) {
    const before = this.notificationRules().find((x) => x.id === id);
    this.notificationRules.update((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    if (before) this.log('Notification Rule Updated', before.contractType, `${before.thresholdDays}-day rule edited.`, 'Success', CURRENT_USER, { previousValue: `${before.channel} → ${before.recipients}`, newValue: `${patch.channel ?? before.channel} → ${patch.recipients ?? before.recipients}` });
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

  // ---------- CSR ----------
  addAgent(a: { name: string; queue: string; vendor: Agent['vendor']; degree: Agent['degree']; nationality: string }) {
    const n = this.next();
    const agent: Agent = { id: 'AG-' + (3000 + n), employeeId: String(4000 + n), name: a.name, queue: a.queue, vendor: a.vendor, degree: a.degree, nationality: a.nationality || 'Oman', joinDate: isoDay(0), status: 'Present' };
    this.agents.update((list) => [agent, ...list]);
    this.attendance.update((att) => ({ ...att, [agent.id]: this.attendanceDays().map((d) => (new Date(d).getDay() >= 5 ? 'OFF' : 'P')) }));
    this.log('Agent Added', agent.employeeId, `${agent.name} added to ${agent.queue} (${agent.vendor}).`);
    return agent;
  }

  setAttendance(agentId: string, dayIndex: number, code: string) {
    this.attendance.update((att) => {
      const row = [...(att[agentId] ?? [])];
      row[dayIndex] = code;
      return { ...att, [agentId]: row };
    });
    if (dayIndex === this.attendanceDays().length - 1) this.syncAgentStatusFromCode(agentId, code);
  }

  /** Approves a Yearly Budget line's amount (CRC-only; does not alter the contract itself). Caller has already checked the contract total is not exceeded. */
  setYearlyBudgetLine(contract: Contract, year: number, line: number, lineDescription: string, approved: number) {
    const key = `${contract.id}:Y${year}:L${line}`;
    const before = this.yearlyBudgetApprovals()[key];
    this.yearlyBudgetApprovals.update((m) => ({ ...m, [key]: approved }));
    this.log('Yearly Budget Line Approved', contract.reference, `Year ${year}, ${lineDescription}: ${before !== undefined ? before.toLocaleString('en-GB') + ' → ' : ''}${approved.toLocaleString('en-GB')} ${contract.currency}.`);
  }

  /** Leave override by the CSR team (does not alter the source WFO record). Applies to today. */
  recordLeave(agentId: string, code: string, note = '') {
    this.setAttendance(agentId, this.attendanceDays().length - 1, code);
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

  /** Payroll (salary components + management fee) for an agent; generated from the tier template if none is stored. */
  payrollFor(a: Agent): PayrollLine {
    return this.payroll()[a.id] ?? this.makePayroll(a.id, a.degree);
  }

  /**
   * Payable calculation for a vendor, from each employee's own billing rate:
   *  - existing staff: billing rate x billable-day ratio (absence "A" is deducted, approved leave stays billable)
   *  - joined this month: billed pro-rata from the joining date on their own line
   *  - resignations: pro-rata to the last day plus leave encashment
   *  - plus the 3 Clicks incentive on calls above the minimum duration
   */
  calculateInvoice(vendorName: string) {
    const key: Agent['vendor'] = vendorName.startsWith('Green') ? 'Green Umbrella' : 'Infoline';
    const att = this.attendance();
    const all = this.agents().filter((a) => a.vendor === key);
    const monthPrefix = this.periodStart().slice(0, 7);
    const [py, pm] = this.periodStart().split('-').map(Number);
    const daysInMonth = new Date(py, pm, 0).getDate();
    const joiners = all.filter((a) => a.joinDate.startsWith(monthPrefix));
    const existing = all.filter((a) => !a.joinDate.startsWith(monthPrefix));

    const absentees: Array<{ agent: Agent; absentDays: number; rate: number; deduction: number }> = [];
    let absentDays = 0;
    const tiers = (['Bachelor', 'Diploma', 'Non-Diploma'] as const).map((degree) => {
      const group = existing.filter((a) => a.degree === degree);
      let gross = 0, amount = 0, factorSum = 0, payroll = 0, fee = 0, overtime = 0;
      for (const a of group) {
        const pay = this.payrollFor(a);
        const codes = att[a.id] ?? [];
        const expected = codes.filter((c) => c !== 'OFF').length;
        const billable = codes.filter((c) => c !== 'OFF' && c !== 'A').length;
        const absent = codes.filter((c) => c === 'A').length;
        const factor = expected ? billable / expected : 0;
        const flatFee = Math.min(pay.managementFee, FLAT_MANAGEMENT_FEE);
        gross += pay.billingRate; amount += pay.billingRate * factor; overtime += pay.additional * factor; factorSum += factor; fee += flatFee; payroll += pay.billingRate - flatFee;
        if (absent) {
          absentDays += absent;
          absentees.push({ agent: a, absentDays: absent, rate: pay.billingRate, deduction: expected ? (pay.billingRate * absent) / expected : 0 });
        }
      }
      return { degree, headcount: group.length, rate: group.length ? gross / group.length : 0, gross, payroll, fee, billableFte: factorSum, amount, overtime, salaryAmount: amount - overtime };
    });
    const gross = tiers.reduce((s, t) => s + t.gross, 0);
    const base = tiers.reduce((s, t) => s + t.amount, 0);
    const overtimeBase = tiers.reduce((s, t) => s + t.overtime, 0);
    const salaryBase = base - overtimeBase;
    const absenceDeduction = gross - base;

    const newJoiners = joiners.map((a) => {
      const pay = this.payrollFor(a);
      const day = Math.min(daysInMonth, Math.max(1, parseInt(a.joinDate.slice(8, 10), 10) || 1));
      const daysBilled = daysInMonth - day + 1;
      return { agent: a, pay, daysBilled, prorated: (pay.billingRate * daysBilled) / daysInMonth };
    });
    const newJoining = { units: newJoiners.length, amount: newJoiners.reduce((s, j) => s + j.prorated, 0) };

    const resignationRecords = this.resignations().filter((r) => r.vendor === key && r.resignDate.startsWith(monthPrefix));
    const resignation = { units: resignationRecords.length, amount: resignationRecords.reduce((s, r) => s + r.total, 0) };

    const threshold = this.payableRules().thresholdSeconds;
    const sampleCalls = all.length * 260;
    const excludedCalls = Math.round(sampleCalls * Math.min(0.6, threshold / 60));
    const eligibleCalls = sampleCalls - excludedCalls;
    const incentive = Math.round(eligibleCalls * 0.05 * 100) / 100;
    const incentiveIncluded = this.payableRules().includeIncentive;
    const subtotal = base + newJoining.amount + resignation.amount + (incentiveIncluded ? incentive : 0);
    const vat = subtotal * 0.05;
    return { vendorName, existing, tiers, gross, base, salaryBase, overtimeBase, absenceDeduction, absentDays, absentees, newJoiners, newJoining, resignationRecords, resignation, sampleCalls, excludedCalls, eligibleCalls, incentive, incentiveIncluded, subtotal, vat, total: subtotal + vat, threshold };
  }

  /**
   * The vendor's payable amount broken into the lines it is actually invoiced on: Salary (base pay, including new
   * joiners and resignation settlements), Overtime (the additions on top of base pay) and the Performance Incentive
   * (3 Clicks). A user can validate and pay any subset of these, not just the whole invoice at once.
   */
  payableLines(vendorName: string): Array<{ key: string; label: string; calculated: number; note?: string }> {
    const c = this.calculateInvoice(vendorName);
    return [
      { key: 'salary', label: 'Salary', calculated: c.salaryBase + c.newJoining.amount + c.resignation.amount },
      { key: 'overtime', label: 'Overtime', calculated: c.overtimeBase },
      { key: 'performance', label: 'Performance Incentive', calculated: c.incentive, note: c.incentiveIncluded ? undefined : 'Not on the vendor invoice by the current payable rule' },
    ];
  }

  /** Records a resignation: the agent leaves the active list and is billed pro-rata plus leave encashment. */
  resignAgent(agentId: string, resignDate: string, leaveDays: number) {
    const a = this.agents().find((x) => x.id === agentId);
    if (!a) return undefined;
    const pay = this.payrollFor(a);
    const rec = this.buildResignation({ employeeId: a.employeeId, name: a.name, queue: a.queue, residentId: pay.residentId, degree: a.degree, vendor: a.vendor, joinDate: a.joinDate, resignDate, gross: pay.gross, managementFee: pay.managementFee, leaveDays, absentDays: 0 });
    this.resignations.update((list) => [rec, ...list]);
    this.agents.update((list) => list.filter((x) => x.id !== agentId));
    this.attendance.update((m) => { const { [agentId]: _gone, ...rest } = m; return rest; });
    this.invoiceRuns.set({});
    this.log('Resignation Recorded', a.employeeId, `${a.name} resigned on ${resignDate}; billed ${rec.total.toFixed(3)} OMR (pro-rata ${rec.prorated.toFixed(3)} + leave encashment ${rec.leaveEncashment.toFixed(3)}).`);
    this.notify(`${a.name}'s resignation was recorded.`, 'CSR Management', 'info', '/invoicing/reconciliation');
    return rec;
  }

  /** Replaces the sample data with the vendor's real monthly annexure (parsed in the browser). */
  importAnnexure(d: AnnexureImport) {
    const vendor: Agent['vendor'] = 'Infoline';
    const agents: Agent[] = [];
    const payroll: Record<string, PayrollLine> = {};
    const att: Record<string, string[]> = {};
    const last = d.attendance.days.length - 1;
    for (const e of d.employees) {
      const id = 'AG-' + e.employeeId;
      const codes = d.attendance.rows[e.employeeId] ?? d.attendance.days.map(() => 'P');
      const code = codes[last] ?? 'P';
      const status: Agent['status'] = code === 'P' ? 'Present' : code === 'OFF' ? 'Off' : code === 'A' ? 'Absent' : 'On Leave';
      agents.push({ id, employeeId: e.employeeId, name: e.name, queue: e.queue || 'Unassigned', vendor, degree: e.degree, nationality: e.nationality, joinDate: e.joinDate, status, leaveType: status === 'On Leave' ? LEAVE_TYPE_BY_CODE[code] : undefined });
      payroll[id] = e.pay;
      att[id] = codes;
    }
    this.agents.set(agents);
    this.payroll.set(payroll);
    this.attendanceDays.set(d.attendance.days);
    this.attendance.set(att);
    this.resignations.set(d.resignations.map((r) => ({ ...r, id: 'RES-' + this.next(), vendor })));
    this.periodStart.set(d.periodStart);
    this.idDocs.set({});
    this.movementRequests.set([]);
    this.invoiceRuns.set({});
    this.importInfo.set({ fileName: d.fileName, employees: agents.length, days: d.attendance.days.length, resignations: d.resignations.length, period: this.period() });
    this.log('Annexure Imported', d.fileName, `${agents.length} employees, ${d.attendance.days.length} attendance days and ${d.resignations.length} resignation(s) loaded for ${this.period()}.`);
    this.notify(`Annexure loaded: ${agents.length} employees for ${this.period()}.`, 'Invoicing & Payments', 'green', '/invoicing/reconciliation');
  }

  /** The latest validation of one payable line this period, if any (each run covers exactly one line). */
  lineRun(vendorName: string, key: string): InvoiceRun | undefined {
    const runs = (this.invoiceRuns()[vendorName] ?? []).filter((r) => r.period === this.period() && r.lines[0]?.key === key);
    return runs[runs.length - 1];
  }

  /** Validates one line or several at once; each line is checked against the tolerance on its own. Approved lines are skipped. */
  validateLines(vendorName: string, lines: InvoiceLineDetail[]) {
    const tol = this.payableRules().deviationPct;
    const todo = lines.filter((l) => this.lineRun(vendorName, l.key)?.status !== 'Approved for payment');
    const runs: InvoiceRun[] = todo.map((l) => {
      const variancePct = l.calculated ? ((l.vendorAmount - l.calculated) / l.calculated) * 100 : 0;
      return { vendor: vendorName, period: this.period(), lines: [l], calculatedTotal: l.calculated, vendorInvoiceAmount: l.vendorAmount, variancePct, status: Math.abs(variancePct) > tol ? 'Flagged for review' : 'Validated' };
    });
    if (!runs.length) return runs;
    this.invoiceRuns.update((m) => ({ ...m, [vendorName]: [...(m[vendorName] ?? []), ...runs] }));
    for (const r of runs) {
      const l = r.lines[0];
      this.log(r.status === 'Validated' ? 'Invoice Validated' : 'Invoice Flagged', vendorName, `${l.label}: vendor invoice ${l.vendorAmount.toFixed(2)} vs calculated ${l.calculated.toFixed(2)} OMR (${r.variancePct >= 0 ? '+' : ''}${r.variancePct.toFixed(2)}%).`);
    }
    const flagged = runs.filter((r) => r.status === 'Flagged for review').map((r) => r.lines[0].label);
    if (flagged.length) this.notify(`${vendorName}: ${flagged.join(', ')} deviate${flagged.length === 1 ? 's' : ''} more than ${tol}% from the calculation.`, 'Invoicing & Payments', 'amber', '/invoicing/reconciliation');
    return runs;
  }

  /** Approves one validated line or several at once; together they become one payment in PO & Payment Tracking. */
  approveLines(vendorName: string, keys: string[]) {
    const runs = keys.map((k) => this.lineRun(vendorName, k)).filter((r): r is InvoiceRun => !!r && (r.status === 'Validated' || r.status === 'Flagged for review'));
    if (!runs.length) return;
    const names = runs.map((r) => r.lines[0].label).join(', ');
    const amount = runs.reduce((sum, r) => sum + r.vendorInvoiceAmount, 0);
    const payment: PaymentRecord = { id: 'PAY-' + this.next(), vendorName, lines: names, invoiceAmount: Math.round(amount), status: 'Pending', slaAtRisk: false, invoiceRef: 'INV-' + this.next(), period: this.period() };
    this.payments.update((list) => [payment, ...list]);
    this.invoiceRuns.update((m) => ({ ...m, [vendorName]: (m[vendorName] ?? []).map((r) => (runs.includes(r) ? { ...r, status: 'Approved for payment', paymentId: payment.id } : r)) }));
    this.log('Invoice Approved', vendorName, `${names}: approved for payment, ${payment.invoiceAmount.toLocaleString()} OMR (${payment.id}).`);
    this.notify(`${vendorName} (${names}) approved for payment.`, 'Invoicing & Payments', 'green', '/invoicing/tracking');
    return payment;
  }

  /** Simulated send — logged and notified like the rest of the demo's "email" actions, no real mailbox behind it. */
  queryVendor(q: Omit<VendorQuery, 'id' | 'sentAt' | 'sentBy'>) {
    const query: VendorQuery = { ...q, id: 'VQ-' + this.next(), sentAt: new Date().toISOString(), sentBy: CURRENT_USER };
    this.vendorQueries.update((list) => [query, ...list]);
    const detail = q.lines.map((l) => `${l.label} invoiced ${l.vendorAmount.toFixed(2)} vs calculated ${l.calculated.toFixed(2)}`).join('; ');
    this.log('Vendor Query Sent', q.vendor, `Emailed ${q.to} (${q.period}): ${detail} OMR. Comment: ${q.comment}`);
    this.notify(`Emailed ${q.vendor} about ${q.lines.map((l) => l.label).join(', ')}.`, 'Invoicing & Payments', 'info', '/invoicing/reconciliation');
    return query;
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
      this.notify(`Payment to ${p.vendorName} completed.`, 'Invoicing & Payments', 'green', '/invoicing/tracking');
    }
  }

  savePayableRules(rules: PayableRules) {
    this.payableRules.set(rules);
    this.invoiceRuns.set({});
    this.log('Payable Rules Saved', 'PAYABLE-RULES', `Min call duration ${rules.thresholdSeconds}s, deviation review ${rules.deviationPct}%${rules.perVendor ? ', per-vendor' : ''}, incentive ${rules.includeIncentive ? 'billed on the invoice' : 'not on the invoice'}. Invoices must be re-validated.`);
  }

  period(): string {
    const [y, m] = this.periodStart().split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  }

  // ---------- internals ----------
  private next() {
    return ++this.seq;
  }

  private seedPermissions(): Record<string, boolean> {
    const granted = (p: Permission, role: string): boolean => {
      if (role === 'System Admin') return true;
      if (SPECIAL[p.permission]) return SPECIAL[p.permission].includes(role);
      if (p.permission === 'View Employee Salary') return role === 'Finance';
      if (p.module === 'Contracts & Budget') {
        if (p.permission === 'Manage Sync Configuration') return false;
        if (['Manage Notifications', 'Manage Escalations'].includes(p.permission)) return role === 'Contract Mgmt Manager';
        if (['Manual Contract Sync', 'Manage Monitoring Actions', 'View Audit History'].includes(p.permission)) return role === 'Contract Mgmt Team' || role === 'Contract Mgmt Manager';
        return role === 'Contract Mgmt Team' || role === 'Contract Mgmt Manager' || role === 'Budget Owner' || role === 'Finance';
      }
      if (p.module === 'Invoicing & Payments') return role === 'Finance';
      return false;
    };
    const grid: Record<string, boolean> = {};
    for (const p of PERMISSIONS) for (const r of ROLES) grid[`${p.permission}|${r}`] = granted(p, r);
    return grid;
  }

  /** Per-contract ERP history (created, linked records, alerts, escalation, syncs) merged with the demo's global audit entries. */
  private seedAudit(): AuditEntry[] {
    const kindLabel: Record<string, string> = { created: 'Contract Sync', attachments: 'Attachments Synced', linked: 'Record Linked', notice: 'Notification Sent', alert: 'Expiry Alert Sent', escalation: 'Escalation Sent', sync: 'Contract Sync', renewal: 'Renewal Initiated' };
    const entries: AuditEntry[] = [];
    for (const c of this.contracts()) {
      const children = childRecordsFor(c);
      for (const e of timelineFor(c, children, attachmentsFor(c, children), this.notificationRules())) {
        entries.push({ id: 'AUD-' + this.next(), timestamp: e.at, actor: e.actor, activityType: kindLabel[e.kind], reference: c.reference, result: e.result, details: e.title + ' — ' + e.details });
      }
    }
    for (const ch of seedChanges(this.contracts())) {
      const c = this.contracts().find((x) => x.id === ch.contractId)!;
      entries.push({ id: 'AUD-' + this.next(), timestamp: ch.at, actor: 'System (Scheduled Sync)', activityType: /status/i.test(ch.field) ? 'Status Change (ERP)' : 'Contract Data Updated (ERP)', reference: ch.contractReference, result: 'Success', details: `${ch.field} changed by the ERP: ${ch.previous} → ${ch.next}.`, erpReference: c.erpReference, previousValue: ch.previous, newValue: ch.next, syncType: ch.source });
    }
    for (const e of entries) {
      e.erpReference ??= this.contracts().find((x) => x.reference === e.reference)?.erpReference;
      e.syncType ??= /Sync|Linked|Attachments/.test(e.activityType) ? 'Automated sync' : undefined;
    }
    return [...entries, ...this.mock.getAuditLog()].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  }

  private makePayroll(id: string, degree: Agent['degree']): PayrollLine {
    const t = this.payableRates.find((r) => r.degree === degree) ?? this.payableRates[0];
    const h = hash(id);
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    const basic = r3(t.basic * (0.8 + (h % 40) / 100));
    const hra = [66.5, 70, 75, 100][h % 4];
    const conveyance = h % 5 === 0 ? 0 : 40;
    const special = Math.round(t.specialAllowance * (0.7 + ((h >> 3) % 60) / 100) * 100) / 100;
    const gross = r3(basic + hra + conveyance + special);
    const additional = r3(t.additions * (0.8 + ((h >> 5) % 40) / 100));
    return { residentId: String(5_000_000 + (h % 20_000_000)), basic, hra, conveyance, special, other: 0, gross, managementFee: 116, additional, deduction: 0, billingRate: r3(gross + 116) };
  }

  private seedPayroll(): Record<string, PayrollLine> {
    const rec: Record<string, PayrollLine> = {};
    for (const a of this.agents()) rec[a.id] = this.makePayroll(a.id, a.degree);
    return rec;
  }

  private buildResignation(r: { employeeId: string; name: string; queue: string; residentId: string; degree: Agent['degree']; vendor: Agent['vendor']; joinDate: string; resignDate: string; gross: number; managementFee: number; leaveDays: number; absentDays: number }): ResignationRecord {
    const [y, m] = r.resignDate.slice(0, 7).split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const day = Math.min(daysInMonth, Math.max(1, parseInt(r.resignDate.slice(8, 10), 10) || 1));
    const monthlyBilling = r.gross + r.managementFee;
    const prorated = Math.round(((monthlyBilling * day) / daysInMonth) * 1000) / 1000;
    // Assumption: leave is encashed at gross / 30 per day — confirm the formula with Omantel / the vendor.
    const leaveEncashment = Math.round(((r.leaveDays * r.gross) / 30) * 1000) / 1000;
    return { id: 'RES-' + this.next(), employeeId: r.employeeId, name: r.name, queue: r.queue, residentId: r.residentId, degree: r.degree, vendor: r.vendor, joinDate: r.joinDate, resignDate: r.resignDate, gross: r.gross, managementFee: r.managementFee, monthlyBilling, prorated, absentDays: r.absentDays, leaveEncashment, total: prorated + leaveEncashment };
  }

  private seedResignations(): ResignationRecord[] {
    const month = this.periodStart().slice(0, 7);
    const sample: Array<[string, string, Agent['degree'], number, number]> = [
      ['Nasser Al-Hinai', 'Retention', 'Diploma', 8, 3], ['Rahma Al-Mamari', 'Sales', 'Non-Diploma', 15, 5],
      ['Yaqoub Al-Shukaili', 'Complaints', 'Bachelor', 21, 2], ['Sumaiya Al-Wahaibi', 'Hotline', 'Diploma', 26, 8],
    ];
    return sample.map(([name, queue, degree, day, leaveDays], i) => {
      const pay = this.makePayroll('RES' + i, degree);
      return this.buildResignation({ employeeId: String(6100 + i), name, queue, residentId: pay.residentId, degree, vendor: 'Infoline', joinDate: '2022-0' + (i + 3) + '-15', resignDate: month + '-' + String(day).padStart(2, '0'), gross: pay.gross, managementFee: 116, leaveDays, absentDays: 0 });
    });
  }

  private seedAttendance(): Record<string, string[]> {
    const rec: Record<string, string[]> = {};
    const agents = this.agents();
    agents.forEach((a, i) => {
      rec[a.id] = this.attendanceDays().map((day, d) => {
        if (new Date(day).getDay() >= 5) return 'OFF';
        const last = d === this.attendanceDays().length - 1;
        if (a.status === 'On Leave' && d >= this.attendanceDays().length - 3) return LEAVE_CODE_BY_TYPE[a.leaveType ?? ''] ?? 'C/L';
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
