import { Injectable, computed, inject, signal } from '@angular/core';
import { WFO_REFERENCE } from './wfo-reference';
import {
  Agent, AnnexureImport, AppNotification, AppUser, AuditEntry, BudgetLine, Candidate, CandidateStatus, ClaimingPeriod, Contract, IdDocument,
  InterviewQuestion, AttendanceChange, InvoiceAdjustment, InvoiceLineDetail, InvoiceRun, MovementAnnouncement, MovementRequest, NotificationRule, PayableLine,
  PayableRules, PaymentRecord, PayrollLine, PerformanceRecord, ResignationRecord, SyncRun, VendorQuery, WorkforceSnapshot,
} from '../models/domain';
import { StatusLevel, daysRemainingToLevel } from '../models/status';
import { MockDataService } from './mock-data.service';
import { NAV_GROUPS, NavGroup } from '../nav.config';
import { attachmentsFor, childRecordsFor, enrichContract, infolineFirst, timelineFor, yearlyBudgetFor } from './contract-data';
import { seedChanges } from './contract-monitoring';

export const CURRENT_USER = 'Hamza Tarkan';
export const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** A single global setting for when/how/to whom a contract-expiry reminder goes out — distinct from the per-contract-type "Alert rules" escalation tiers. */
export interface ContractExpirySettings {
  /** How long before the contract's end date the reminder starts — the SRS's example is 7 months before a 31-Dec expiry starting 31-May. */
  startMonths: number;
  frequency: 'Daily' | 'Weekly' | 'Twice weekly' | 'Custom';
  /** Only used when frequency is 'Custom'. */
  customDays?: number;
  recipients: string;
  channel: string;
  active: boolean;
  continueUntilExpiry: boolean;
}
/** A specific calendar date the org observes as a public holiday — overtime worked on it is paid at the holiday rate. */
export interface OfficialHoliday { date: string; label: string }

export type WfoComponent = 'salary' | 'overtime' | 'performance' | 'incentive' | 'fee' | 'voice' | 'chat' | 'msIncentive' | 'yearlyPerformance' | 'project';

/** Admin-configured rules for the per-agent Performance and Overtime lines. */
/** An overtime rate formula for a vendor, a contract, a line (queue) or any mix of them; 'All' means any. */
export interface OvertimeRule { id: string; vendor: string; contract: string; line: string; days: number; hoursPerDay: number; premium: number }

export interface PayrollRules {
  /** An Omani agent can be given a performance amount only with a performance score above this percentage. */
  omaniMinScore: number;
  /** The same for a non-Omani agent. */
  nonOmaniMinScore: number;
  /** Overtime pay = basic ÷ days ÷ hours per day × premium × overtime hours (June 2026 overtime sheet). */
  overtimePremium: number;
  overtimeDays: number;
  overtimeHoursPerDay: number;
  /** Same formula, but for the hours worked on an official holiday — configurable, default 200% (×2). */
  holidayOvertimePremium: number;
}
/** One agent's figures for one month (WFO / performance system): the performance score, the overtime hours worked, and how many of those were on an official holiday. */
export interface AgentMonth { performanceScore: number; overtimeHours: number; holidayOvertimeHours: number }
/** One line the vendor can invoice on a contract: calculated from WFO attendance, or the contract's monthly share. */
export interface PayableLineItem {
  key: string;
  label: string;
  calculated: number;
  source: 'wfo' | 'contract';
  component?: WfoComponent;
  /** Set when this line is a transaction channel (Voice or Chat/Non Voice): billed from the imported transaction invoice, not the contract share. */
  txChannel?: TxChannel;
  /** Set when this is the Manage Service Incentive line: billed from its own imported file, not the contract share. */
  msIncentive?: boolean;
  /** How a contract-share line was worked out. */
  basis?: string;
  note?: string;
}
/** The vendor's own annexure file, read once for comparison: what they claim per component, never a replacement for our WFO data. */
export interface VendorAnnexureClaim {
  fileName: string; importedAt: string; period: string; employees: number; days: number; resignations: number; claim: Partial<Record<WfoComponent, number>>; total: number;
  /** The vendor's own figures per degree tier (their agents, billable FTE, salary and overtime), so a difference can be located. */
  tiers: Array<{ degree: string; agents: number; fte: number; salary: number; overtime: number }>;
  joiners: { agents: number; salary: number };
  resignationTotal: number;
  /** One row per employee on the vendor's annexure, so their bill can be compared with ours employee by employee. */
  people: VendorPerson[];
  resignationRows: Array<{ employeeId: string; name: string; queue: string; degree: string; total: number; resignDate: string }>;
}
export interface VendorPerson { employeeId: string; name: string; queue: string; degree: string; joinDate: string; rate: number; expected: number; billable: number; absent: number; maternity: number; codes: string[]; amount: number; overtime: number; joiner: boolean }
/** One employee (or resignation) on the vendor's annexure against our calculation. */
export interface EmployeeCompareRow {
  key: string; employeeId: string; name: string; queue: string; degree: string;
  kind: 'Salary' | 'Resignation';
  status: 'Matches' | 'Different' | 'Only on vendor annexure' | 'Only in our WFO';
  ours: number; theirs: number; diff: number;
  reasons: string[];
  /** Days where the attendance code differs (only when both files cover the same number of days). */
  days: Array<{ day: number; vendor: string; ours: string }>;
}
export interface AgentBillRow { agent: Agent; kind: 'existing' | 'joiner'; rate: number; expected: number; billable: number; absent: number; /** Maternity leave (M/L) is not paid. */ maternity: number; amount: number; codes: string[] }
/** One part of a Salary / Overtime figure: what we calculated against what the vendor's annexure says. */
export interface AnnexureCompareRow { label: string; ours: number; theirs: number; oursDetail: string; theirsDetail: string }
export const WFO_COMPONENTS: WfoComponent[] = ['salary', 'overtime', 'performance', 'incentive', 'fee', 'voice', 'chat', 'msIncentive', 'yearlyPerformance', 'project'];
export const WFO_LABEL: Record<WfoComponent, string> = { salary: 'Salary', overtime: 'Overtime', performance: 'Performance', incentive: 'Incentive', fee: 'Management fee', voice: 'Voice', chat: 'Chat', msIncentive: 'Manage Service Incentive', yearlyPerformance: 'Yearly Performance', project: 'Project' };
/** One PO line (of every active contract) a user can link to a calculated component, so Reconciliation knows to bill it from WFO instead of the contract's yearly share. */
export interface PayableLineCatalogItem { key: string; vendorName: string; contractRef: string; contractName: string; label: string; scope: string; component: WfoComponent | null }
/** An invoice item added by hand from "Create Invoice Item" — sits alongside the ERP's own PO lines on Reconciliation and Payable Line Mapping. */
export interface CustomInvoiceItem { id: string; contractRef: string; vendorName: string; label: string; scope: string; allocated: number; component: WfoComponent | null; createdAt: string; createdBy: string }
const addMonthsIso = (iso: string, n: number) => { const [y, m] = iso.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 10); };
/** The contract's flat management fee per employee per month (OMR). */
export const FLAT_MANAGEMENT_FEE = 116;
import type { TransactionInvoiceImport, TxChannel } from './transaction-invoice-import';
import type { OvertimeImport } from './overtime-import';
import type { MsIncentiveImport } from './ms-incentive-import';

export interface OvertimeCompareRow {
  employeeId: string; name: string; queue: string;
  status: 'Matches' | 'Different' | 'Only on vendor file' | 'Only in our records';
  oursHours: number; theirsHours: number; oursAmount: number; theirsAmount: number; diff: number; reasons: string[];
}
export const VENDOR_CONTACT: Record<string, string> = { 'Infoline LLC': 'accounts@infoline.om', 'Green Umbrella Services': 'billing@greenumbrella.om' };
export type ServiceClass = 'Secondment' | 'Managed Services · Voice' | 'Managed Services · Non Voice';
export const SERVICE_CLASSES: ServiceClass[] = ['Secondment', 'Managed Services · Voice', 'Managed Services · Non Voice'];
const LEAVE_EN: Record<string, string> = { P: 'Present', OFF: 'Off day', A: 'Absent', 'S/L': 'Sick Leave', 'C/L': 'Annual Leave', 'M/L': 'Maternity Leave', 'P/L': 'Paternity Leave', SP: 'Compassionate Leave', 'ST/L': 'Study Leave', AS: 'Accompanying a sick family member' };
const LEAVE_AR: Record<string, string> = { P: 'حاضر', OFF: 'يوم عطلة', A: 'غائب', 'S/L': 'إجازة مرضية', 'C/L': 'إجازة سنوية', 'M/L': 'إجازة أمومة', 'P/L': 'إجازة أبوة', SP: 'إجازة ظرفية', 'ST/L': 'إجازة دراسية', AS: 'مرافقة مريض' };
export const ROLE_SUMMARY: Record<string, string> = {
  'System Admin': 'Everything, plus access control and audit',
  'Vendor': 'Imports, validates and submits invoice lines for their own contracts',
  'Billing': 'Reviews submitted lines: approves or rejects, and sets the claiming period',
};
export const ROLES = ['Vendor', 'Billing', 'System Admin'];
export const VENDOR_ROLE = 'Vendor';

export interface Permission { permission: string; module: string; }
export const PERMISSIONS: Permission[] = [
  { permission: 'View Contracts', module: 'Contracts & Budget' },
  { permission: 'View Contract Details', module: 'Contracts & Budget' },
  { permission: 'Manual Contract Sync', module: 'Contracts & Budget' },
  { permission: 'View Sync History', module: 'Contracts & Budget' },
  { permission: 'View Attachments', module: 'Contracts & Budget' },
  { permission: 'View Dashboards', module: 'Contracts & Budget' },
  { permission: 'View General Dashboard', module: 'Contracts & Budget' },
  { permission: 'Classify Contracts', module: 'Contracts & Budget' },
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
  { permission: 'Edit Forecast', module: 'Forecast' },
  { permission: 'Export Forecast', module: 'Forecast' },
  { permission: 'Configure Forecast', module: 'Forecast' },
  { permission: 'View Team Forecast', module: 'Forecast' },
  { permission: 'View Transaction Forecast', module: 'Forecast' },
  { permission: 'View Agent Profiles', module: 'CSR Management' },
  { permission: 'Manage Recruitment', module: 'CSR Management' },
  { permission: 'View Employee Salary', module: 'CSR Management' },
  { permission: 'View Leave & Attendance', module: 'CSR Management' },
  { permission: 'Manage Leave & Attendance', module: 'CSR Management' },
  { permission: 'Create Movement Announcement', module: 'Internal Project Movement' },
  { permission: 'Review/Approve Movement Requests', module: 'Internal Project Movement' },
  { permission: 'Validate Invoice', module: 'Invoicing & Payments' },
  { permission: 'Configure Payable Rules', module: 'Invoicing & Payments' },
  { permission: 'Approve Invoice', module: 'Invoicing & Payments' },
  { permission: 'Configure Claiming Period', module: 'Invoicing & Payments' },
];

/** What each role may do, from the Vendor Invoice Claiming SRS. System Admin has everything. A vendor imports, validates and submits their own invoice lines (Validate Invoice); Billing, the CRC team, reviews the files and approves or rejects them (Approve Invoice). */
const ROLE_GRANTS: Record<string, string[]> = {
  Vendor: ['View Contracts', 'View Contract Details', 'View Leave & Attendance', 'Validate Invoice'],
  Billing: ['View Contracts', 'View Contract Details', 'View Attachments', 'View Agent Profiles', 'View Leave & Attendance', 'Manage Leave & Attendance', 'Approve Invoice', 'Configure Payable Rules', 'Configure Claiming Period'],
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
  /** How each contract is reported on the General Dashboard, by contract reference. Seeded: the Infoline salary PO is the secondment contract. */
  readonly serviceClass = signal<Record<string, ServiceClass>>(this.seedServiceClass());
  setServiceClass(reference: string, cls: ServiceClass | null) {
    this.serviceClass.update((m) => { const { [reference]: _old, ...rest } = m; return cls ? { ...rest, [reference]: cls } : rest; });
    this.log('Contract Classified', reference, cls ? `Reported as ${cls} on the General Dashboard.` : 'Removed from the General Dashboard.');
  }
  transactionInvoiceFor(vendorName: string, channel: TxChannel): TransactionInvoiceImport | undefined {
    return this.transactionInvoices()[`${vendorName}|${channel}`]?.[0];
  }

  /** Every Voice/Chat invoice ever imported this session, across every vendor and month — newest first within each vendor+channel. */
  transactionInvoiceHistory(): { vendorName: string; data: TransactionInvoiceImport }[] {
    return Object.entries(this.transactionInvoices()).flatMap(([key, list]) => list.map((data) => ({ vendorName: key.split('|')[0], data })));
  }

  importTransactionInvoice(vendorName: string, data: TransactionInvoiceImport) {
    const key = `${vendorName}|${data.channel}`;
    this.transactionInvoices.update((m) => {
      const rest = (m[key] ?? []).filter((x) => x.periodStart !== data.periodStart);
      return { ...m, [key]: [data, ...rest].sort((a, b) => b.periodStart.localeCompare(a.periodStart)) };
    });
    this.log('Transaction Invoice Imported', `${vendorName} · ${data.channel}`, `${data.fileName}: ${data.invoicedTransactions.toLocaleString('en-GB')} invoiced transactions, ${data.totalInvoicedAmount.toLocaleString('en-GB')} OMR, ${data.totalPenalty ? data.totalPenalty.toLocaleString('en-GB') + ' OMR penalty/incentive' : 'no penalty'}.`);
    this.notify(`${data.fileName} loaded — ${vendorName} ${data.channel} invoice compared for ${this.period()}.`, 'Invoicing & Payments', 'green', '/invoicing/reconciliation');
    // There is nothing of ours to check it against — the file's own total IS the figure on both sides — so it goes straight to Validated, ready to approve.
    const contractRef = this.payableContracts(vendorName)[0]?.reference;
    const line = contractRef ? this.payableLines(vendorName, contractRef).find((l) => l.txChannel === data.channel) : undefined;
    if (line) this.validateLines(vendorName, [{ key: line.key, label: line.label, calculated: line.calculated, vendorAmount: line.calculated }]);
  }

  /** The vendor's claimed Manage Service Incentive total from their own workbook — undefined until one is imported. */
  msIncentiveClaim(vendorName: string): number | undefined {
    return this.msIncentiveInvoices()[vendorName]?.[0]?.total;
  }

  /** Every Manage Service Incentive file imported this session, across every vendor and month — newest first within each vendor. */
  msIncentiveInvoiceHistory(): { vendorName: string; data: MsIncentiveImport }[] {
    return Object.entries(this.msIncentiveInvoices()).flatMap(([vendorName, list]) => list.map((data) => ({ vendorName, data })));
  }

  importMsIncentiveInvoice(vendorName: string, data: MsIncentiveImport) {
    this.msIncentiveInvoices.update((m) => {
      const rest = (m[vendorName] ?? []).filter((x) => x.month !== data.month);
      return { ...m, [vendorName]: [data, ...rest].sort((a, b) => b.month - a.month) };
    });
    this.log('Manage Service Incentive Imported', vendorName, `${data.fileName}: ${data.rows.length} categor${data.rows.length === 1 ? 'y' : 'ies'}, ${data.total.toLocaleString('en-GB')} OMR claimed.`);
    this.notify(`${data.fileName} loaded — ${vendorName} Manage Service Incentive compared for ${this.period()}.`, 'Invoicing & Payments', 'green', '/invoicing/reconciliation');
    // There is nothing of ours to check it against — the file's own total IS the figure on both sides — so it goes straight to Validated, ready to approve.
    // The Manage Service Incentive PO line is not always on the vendor's current billing contract (it can sit on an older contract-year), so every contract of theirs is checked.
    for (const c of this.contracts().filter((x) => x.vendorName === vendorName)) {
      const line = this.payableLines(vendorName, c.reference).find((l) => l.component === 'msIncentive');
      if (line) this.validateLines(vendorName, [{ key: line.key, label: line.label, calculated: line.calculated, vendorAmount: line.calculated }]);
    }
  }

  /** The vendor's claimed overtime total from their own workbook — undefined until one is imported. */
  overtimeClaim(vendorName: string): number | undefined {
    return this.overtimeInvoices()[vendorName]?.total;
  }

  importOvertimeInvoice(vendorName: string, data: OvertimeImport) {
    this.overtimeInvoices.update((m) => ({ ...m, [vendorName]: data }));
    this.log('Overtime File Imported', vendorName, `${data.fileName}: ${data.rows.length} employee(s), ${data.total.toLocaleString('en-GB')} OMR claimed.`);
    this.notify(`${data.fileName} loaded — ${vendorName} overtime compared for ${this.period()}.`, 'Invoicing & Payments', 'green', '/invoicing/reconciliation');
  }

  /** Their claimed overtime hours and amount against our WFO calculation, employee by employee, matched by employee ID. */
  overtimeEmployees(vendorName: string): { fileName: string; rows: OvertimeCompareRow[] } | null {
    const file = this.overtimeInvoices()[vendorName];
    if (!file) return null;
    const key: Agent['vendor'] = vendorName.startsWith('Green') ? 'Green Umbrella' : 'Infoline';
    const agents = this.agents().filter((a) => a.vendor === key);
    const byId = new Map(agents.map((a) => [String(a.employeeId).trim(), a]));
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    const rows: OvertimeCompareRow[] = [];
    const seen = new Set<string>();
    for (const v of file.rows) {
      seen.add(v.employeeId);
      const a = byId.get(v.employeeId);
      if (!a) { rows.push({ employeeId: v.employeeId, name: v.name, queue: v.queue, status: 'Only on vendor file', oursHours: 0, theirsHours: v.hours, oursAmount: 0, theirsAmount: v.amount, diff: v.amount, reasons: ['Billed by the vendor, but not an active agent in our records'] }); continue; }
      const ot = this.overtimeFor(a);
      const diff = r3(v.amount - ot.amount), reasons: string[] = [];
      if (Math.abs(diff) >= 0.005) {
        if (Math.abs(v.hours - ot.hours) >= 0.05) reasons.push(`Overtime hours: vendor ${v.hours}h, ours ${ot.hours}h`);
        if (Math.abs(v.premium - this.payrollRules().overtimePremium) >= 0.005) reasons.push(`Premium: vendor ×${v.premium}, ours ×${this.payrollRules().overtimePremium}`);
        if (!reasons.length) reasons.push('The amounts differ');
      }
      rows.push({ employeeId: v.employeeId, name: v.name || a.name, queue: v.queue || a.queue, status: Math.abs(diff) >= 0.005 ? 'Different' : 'Matches', oursHours: ot.hours, theirsHours: v.hours, oursAmount: r3(ot.amount), theirsAmount: v.amount, diff, reasons });
    }
    for (const a of agents) {
      const id = String(a.employeeId).trim();
      if (seen.has(id)) continue;
      const ot = this.overtimeFor(a);
      if (ot.amount < 0.005) continue;
      rows.push({ employeeId: id, name: a.name, queue: a.queue, status: 'Only in our records', oursHours: ot.hours, theirsHours: 0, oursAmount: r3(ot.amount), theirsAmount: 0, diff: -r3(ot.amount), reasons: ['In our records, but missing from the vendor overtime file — not billed'] });
    }
    rows.sort((x, y) => Number(y.status !== 'Matches') - Number(x.status !== 'Matches') || Math.abs(y.diff) - Math.abs(x.diff));
    return { fileName: file.fileName, rows };
  }

  private seedServiceClass(): Record<string, ServiceClass> {
    const list = this.contracts(), rec: Record<string, ServiceClass> = {};
    const salary = list.find((c) => c.poNumber === '325100185');
    if (salary) rec[salary.reference] = 'Secondment';
    const rest = list.filter((c) => c !== salary && c.status !== 'Cancelled' && c.status !== 'Expired');
    if (rest[0]) rec[rest[0].reference] = 'Managed Services · Voice';
    if (rest[1]) rec[rest[1].reference] = 'Managed Services · Non Voice';
    return rec;
  }

  readonly agents = signal<Agent[]>([
    ...this.mock.getAgents(48).filter((a) => a.vendor !== 'Infoline'),
    ...WFO_REFERENCE.employees.map((e): Agent => ({ id: 'AG-' + e.id, employeeId: e.id, name: e.n, queue: e.q, vendor: 'Infoline', degree: e.d, nationality: e.nat, joinDate: e.j, status: 'Present', gender: hash(e.id) % 2 === 0 ? 'Male' : 'Female' })),
  ]);
  readonly attendanceDays = signal<string[]>(WFO_REFERENCE.days);
  /** The weekly rest day(s), as JS Date.getDay() indices (0=Sunday … 6=Saturday). Default: Friday & Saturday. */
  readonly weeklyOffDays = signal<number[]>([5, 6]);
  /** Specific public-holiday dates on top of the weekly off days — both are paid at the holiday overtime rate when worked. */
  readonly officialHolidays = signal<OfficialHoliday[]>([
    { date: '2025-11-18', label: "Oman National Day" },
    { date: '2026-01-01', label: "New Year's Day" },
  ]);
  readonly attendance = signal<Record<string, string[]>>(this.seedAttendance());
  readonly idDocs = signal<Record<string, IdDocument>>(this.seedIdDocs());
  readonly snapshots: WorkforceSnapshot[] = this.mock.getWorkforceSnapshots();
  readonly candidates = signal<Candidate[]>(
    this.mock.getCandidates().map((c, i): Candidate => ({ ...c, status: i % 5 === 0 ? 'New' : c.status, score: i % 5 === 0 ? 0 : c.score })),
  );

  readonly announcements = signal<MovementAnnouncement[]>(this.mock.getMovementAnnouncements());
  readonly movementRequests = signal<MovementRequest[]>(this.seedMovementRequests());

  readonly payableRates: PayableLine[] = this.mock.getPayableLines();
  /** The vendor's monthly transaction invoice (Voice or Chat), one history per vendor+channel, newest first — the [0] entry replaces the contract-share estimate for that line, since there is no independent calculation for it. Keyed `${vendorName}|${channel}`. */
  readonly transactionInvoices = signal<Record<string, TransactionInvoiceImport[]>>({});
  /** The vendor's own monthly overtime workbook, one per vendor — compared against our WFO overtime calculation, employee by employee. */
  readonly overtimeInvoices = signal<Record<string, OvertimeImport>>({});
  /** The vendor's monthly Manage Service Incentive workbook, one per vendor — there is no independent calculation for it, so its own total is what is paid. */
  /** One history per vendor, newest first — the [0] entry is the current claim. */
  readonly msIncentiveInvoices = signal<Record<string, MsIncentiveImport[]>>({});
  /** Invoice items added by hand from "Create Invoice Item" — on top of whatever PO lines the ERP has for the contract. */
  readonly customInvoiceItems = signal<CustomInvoiceItem[]>([]);
  /** First day of the billing month. Our own agents, payroll and attendance are the WFO's (synced daily); an annexure import never changes them. */
  readonly periodStart = signal(WFO_REFERENCE.periodStart);
  readonly payroll = signal<Record<string, PayrollLine>>(this.seedPayroll());
  readonly resignations = signal<ResignationRecord[]>(this.seedResignations());
  readonly importInfo = signal<{ fileName: string; employees: number; days: number; resignations: number; period: string } | null>(null);
  /** The vendor's claimed amount per payable component, read from their annexure file — compared against our WFO calculation, never replacing it. */
  readonly vendorAnnexures = signal<Record<string, VendorAnnexureClaim>>({});
  readonly payrollRules = signal<PayrollRules>({ omaniMinScore: 90, nonOmaniMinScore: 95, overtimePremium: 1.25, overtimeDays: 30, overtimeHoursPerDay: 8, holidayOvertimePremium: 2 });
  /** Performance rates set by an admin on Performance Settings, replacing the seeded ones. */
  readonly performanceRates = signal<Record<string, number>>({});
  /** Overtime rates (OMR / hour) set for individual agents on Overtime Settings; everyone else follows the formula. */
  readonly overtimeRates = signal<Record<string, number>>({});
  /** Overtime formulas scoped to a vendor / contract / line; agents no rule covers use the default in payrollRules. */
  readonly overtimeRules = signal<OvertimeRule[]>([]);
  readonly payableRules = signal<PayableRules>({ thresholdSeconds: 10, deviationPct: 0, perVendor: false, includeIncentive: false });
  /** Which calculated component (if any) each PO line is billed from, keyed `${contractRef}|L${line}` — set on Payable Line Mapping, used by payableLines(). */
  readonly lineMapping = signal<Record<string, WfoComponent>>(this.seedLineMapping());
  /** Every validate/approve pass, per vendor, oldest first — a vendor can have several, one per subset of lines paid over time. */
  readonly invoiceRuns = signal<Record<string, InvoiceRun[]>>({});
  readonly payments = signal<PaymentRecord[]>(this.mock.getPaymentRecords());
  /** Emails sent to a vendor querying a line where they invoiced more than the calculation — simulated, not a real mailbox. */
  readonly vendorQueries = signal<VendorQuery[]>([]);

  readonly users = signal<AppUser[]>([
    { id: 'U1', name: 'Hamza Tarkan', email: 'hamza.tarkan@omantel.om', role: 'System Admin', active: true },
    { id: 'U2', name: 'Salim Al-Habsi', email: 'salim.alhabsi@omantel.om', role: 'Billing', active: true },
    { id: 'U3', name: 'Mariam Al-Kindi', email: 'mariam.alkindi@omantel.om', role: 'Billing', active: true },
    { id: 'U4', name: 'Khalid Al-Farsi', email: 'khalid.alfarsi@omantel.om', role: 'Billing', active: true },
    { id: 'U5', name: 'Noor Al-Rawahi', email: 'noor.alrawahi@omantel.om', role: 'Billing', active: true },
    { id: 'U6', name: 'Talal Al-Amri', email: 'talal.alamri@omantel.om', role: 'Billing', active: false },
    { id: 'U7', name: 'Infoline LLC', email: 'accounts@infoline.om', role: VENDOR_ROLE, active: true, vendorName: 'Infoline LLC' },
    { id: 'U8', name: 'Green Umbrella Services', email: 'billing@greenumbrella.om', role: VENDOR_ROLE, active: true, vendorName: 'Green Umbrella Services' },
  ]);

  // ---------- vendor claiming portal ----------
  /** Set once a vendor signs in at /login; null means no vendor is currently signed in. Separate from currentRole/switchRole, which internal CRC staff use to preview other CRC roles. */
  readonly vendorSession = signal<AppUser | null>(null);

  /** Which claiming-sheet templates the signed-in user has downloaded this session (`vendor|kind`) — an import unlocks only after its template. */
  readonly templatesDownloaded = signal<Set<string>>(new Set());
  markTemplate(key: string) { this.templatesDownloaded.update((s) => new Set(s).add(key)); }

  /** The one vendor this session may see and claim for: the signed-in vendor, or Infoline LLC when the Vendor role is only previewed from the account menu. Null for every other role. */
  readonly ownVendor = computed<string | null>(() => (this.currentRole() === VENDOR_ROLE ? this.vendorSession()?.vendorName ?? 'Infoline LLC' : null));

  /** Looks up an active Vendor-role user by email (any password is accepted — no real auth backend exists anywhere in this app). Returns null for an unknown/inactive email. */
  vendorLogin(email: string): AppUser | null {
    const user = this.users().find((u) => u.role === VENDOR_ROLE && u.active && u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) return null;
    this.vendorSession.set(user);
    this.currentRole.set(VENDOR_ROLE);
    this.log('Vendor Signed In', user.vendorName ?? user.name, `${user.name} signed in to the vendor claiming portal.`, 'Success', user.name);
    return user;
  }

  vendorLogout() {
    const user = this.vendorSession();
    if (user) this.log('Vendor Signed Out', user.vendorName ?? user.name, `${user.name} signed out of the vendor claiming portal.`, 'Success', user.name);
    this.vendorSession.set(null);
    this.currentRole.set('System Admin');
  }

  readonly claimingPeriod = signal<ClaimingPeriod>({
    startAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    endAt: new Date(Date.now() + 10 * 86400000).toISOString(),
    active: true,
    contractRefs: 'All',
  });

  /** The clock the claiming window is judged against; ticks every 30 seconds so the window opens and closes on its own. */
  private readonly now = signal(Date.now());
  private wasClaimingOpen = true;

  readonly isClaimingOpen = computed(() => {
    const p = this.claimingPeriod();
    const now = this.now();
    return p.active && now >= new Date(p.startAt).getTime() && now <= new Date(p.endAt).getTime();
  });

  /** Open for one contract: the window is open and either covers every contract or lists this one. */
  isClaimingOpenFor(contractRef: string): boolean {
    const scope = this.claimingPeriod().contractRefs;
    return this.isClaimingOpen() && (scope === 'All' || scope.includes(contractRef));
  }

  /** Called on every clock tick and every save: the moment the window turns open, the vendor users are emailed (simulated, like every email in the demo). */
  private checkClaimingWindow() {
    this.now.set(Date.now());
    const open = this.isClaimingOpen();
    if (open && !this.wasClaimingOpen) {
      const scope = this.claimingPeriod().contractRefs;
      const vendors = scope === 'All' ? null : new Set(this.contracts().filter((c) => scope.includes(c.reference)).map((c) => c.vendorName));
      const to = this.users().filter((u) => u.role === VENDOR_ROLE && u.active && (!vendors || vendors.has(u.vendorName ?? ''))).map((u) => u.email);
      this.log('Vendor Emailed', 'Claiming Period', `Invoice claiming is open until ${new Date(this.claimingPeriod().endAt).toLocaleString()} — email sent to ${to.join(', ')}.`, 'Success', 'System Scheduler');
      this.notify(`Claiming period is open — ${to.length} vendor user(s) emailed.`, 'Invoicing & Payments', 'info');
    }
    this.wasClaimingOpen = open;
  }

  saveClaimingPeriod(next: ClaimingPeriod) {
    this.claimingPeriod.set(next);
    this.log('Claiming Period Updated', 'Claiming Period', `Window set to ${new Date(next.startAt).toLocaleString()} → ${new Date(next.endAt).toLocaleString()} (${next.active ? 'Active' : 'Inactive'}).`);
    this.checkClaimingWindow();
  }

  /** A vendor's own live contracts only (Active or Expiring Soon) — never another vendor's, and never an expired or cancelled one. */
  vendorContracts(vendorName: string) {
    return this.contracts().filter((c) => c.vendorName === vendorName && (c.status === 'Active' || c.status === 'Expiring Soon'));
  }

  constructor() {
    this.seedSubmissions();
    this.seedWfoFeed();
    this.wasClaimingOpen = this.isClaimingOpen();
    setInterval(() => { this.checkClaimingWindow(); this.syncWfo(); }, 30000);
  }

  /** Demo data so Billing opens the Reconciliation list with lines the vendor has already submitted (and one it rejected) to review, approve or reject. */
  private seedSubmissions() {
    const vendorName = 'Infoline LLC';
    const ref = this.vendorContracts(vendorName)[0]?.reference;
    if (!ref) return;
    const lines = this.payableLines(vendorName, ref);
    const docs = [
      { kind: 'Invoice', name: 'infoline-invoice-jan-2026.pdf', size: 184000 },
      { kind: 'Payment Certificate', name: 'infoline-payment-certificate-jan-2026.pdf', size: 96000 },
      { kind: 'Other', name: 'infoline-supporting-documents.pdf', size: 64000 },
    ];
    const seed = (component: WfoComponent, status: 'Submitted for approval' | 'Rejected', rejectReason?: string): InvoiceRun[] => {
      const l = lines.find((x) => x.component === component);
      if (!l) return [];
      return [{ vendor: vendorName, period: this.period(), lines: [{ key: l.key, label: l.label, calculated: l.calculated, vendorAmount: l.calculated }], calculatedTotal: l.calculated, vendorInvoiceAmount: l.calculated, variancePct: 0, status, documents: docs, submittedAt: new Date(Date.now() - 86400000).toISOString(), rejectReason }];
    };
    const runs = [...seed('performance', 'Submitted for approval'), ...seed('incentive', 'Submitted for approval'), ...seed('yearlyPerformance', 'Submitted for approval'), ...seed('project', 'Rejected', 'The amount is not supported by the attached documents.')];
    if (runs.length) this.invoiceRuns.set({ [vendorName]: runs });
  }

  /** A vendor sends validated lines to Billing with the invoice and payment certificate attached — only while the claiming period is open. */
  submitLines(vendorName: string, contractRef: string, keys: string[], documents: Array<{ kind: string; name: string; size: number; url?: string }>, adjustments: InvoiceAdjustment[] = []): { ok: true; count: number } | { ok: false; reason: string } {
    if (this.ownVendor() && !this.isClaimingOpenFor(contractRef)) return { ok: false, reason: 'The claiming period is closed for this contract.' };
    const runs = keys.map((k) => this.lineRun(vendorName, k)).filter((r): r is InvoiceRun => r?.status === 'Validated');
    if (!runs.length) return { ok: false, reason: 'Validate the lines first — only lines that match can be submitted.' };
    const submittedAt = new Date().toISOString();
    this.invoiceRuns.update((m) => ({ ...m, [vendorName]: (m[vendorName] ?? []).map((r) => (runs.includes(r) ? { ...r, status: 'Submitted for approval', documents, submittedAt, rejectReason: undefined, adjustments: r === runs[0] ? adjustments : undefined } : r)) }));
    const included = adjustments.map((a) => a.changeId).filter((id): id is string => !!id);
    if (included.length) this.attendanceChanges.update((l) => l.map((c) => (included.includes(c.id) ? { ...c, status: 'Included in claim' } : c)));
    const names = runs.map((r) => r.lines[0].label).join(', ');
    this.log('Invoice Submitted', vendorName, `${names} submitted for approval with ${documents.length} document(s): ${documents.map((d) => (d.kind === 'Other' ? d.name : d.kind)).join(', ')}${adjustments.length ? `; ${adjustments.length} adjustment(s), net ${adjustments.reduce((t, a) => t + (a.type === 'Addition' ? a.amount : -a.amount), 0).toFixed(2)} OMR` : ''}.`, 'Success', vendorName);
    this.notify(`${vendorName} submitted ${names} for approval.`, 'Invoicing & Payments', 'info', '/invoicing/reconciliation');
    return { ok: true, count: runs.length };
  }

  /** Billing sends submitted lines back to the vendor, who can correct and validate them again. */
  rejectLines(vendorName: string, keys: string[], reason: string) {
    const runs = keys.map((k) => this.lineRun(vendorName, k)).filter((r): r is InvoiceRun => r?.status === 'Submitted for approval');
    if (!runs.length) return;
    this.invoiceRuns.update((m) => ({ ...m, [vendorName]: (m[vendorName] ?? []).map((r) => (runs.includes(r) ? { ...r, status: 'Rejected', rejectReason: reason } : r)) }));
    const names = runs.map((r) => r.lines[0].label).join(', ');
    this.log('Invoice Rejected', vendorName, `${names} rejected. Reason: ${reason}`);
    this.notify(`${names} was rejected — ${reason}`, 'Invoicing & Payments', 'red', '/invoicing/reconciliation');
  }

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

  readonly contractExpirySettings = signal<ContractExpirySettings>({
    startMonths: 7, frequency: 'Weekly', recipients: 'Contract owner, Contract Management team', channel: 'Email', active: true, continueUntilExpiry: true,
  });

  saveContractExpirySettings(next: ContractExpirySettings) {
    this.contractExpirySettings.set(next);
    this.log('Contract Expiry Notification Saved', 'CONTRACT-EXPIRY', `Starts ${next.startMonths} month(s) before expiry, ${next.frequency.toLowerCase()}${next.frequency === 'Custom' ? ` (every ${next.customDays} day(s))` : ''}, to ${next.recipients} via ${next.channel}${next.continueUntilExpiry ? ', continuing until expiry' : ''}.`);
  }

  // ---------- CSR ----------
  addAgent(a: { name: string; queue: string; vendor: Agent['vendor']; degree: Agent['degree']; nationality: string }) {
    const n = this.next();
    const agent: Agent = { id: 'AG-' + (3000 + n), employeeId: String(4000 + n), name: a.name, queue: a.queue, vendor: a.vendor, degree: a.degree, nationality: a.nationality || 'Oman', joinDate: isoDay(0), status: 'Present' };
    this.agents.update((list) => [agent, ...list]);
    this.attendance.update((att) => ({ ...att, [agent.id]: this.attendanceDays().map((d) => (this.isOffDay(d) ? 'OFF' : 'P')) }));
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


  // ---------- WFO sync → previous-month changes → salary adjustments → agent notifications ----------
  /** Our synced copy of previous-month days that the WFO later changed, keyed `${agentId}|${day}` (everything else is the archive as first reported). */
  readonly pastCorrections = signal<Record<string, string>>({});
  /** Every previous-month change that moved an agent's pay: the original record, the updated record and the resulting adjustment, kept for reconciliation and audit. */
  readonly attendanceChanges = signal<AttendanceChange[]>([]);
  /** The latest WFO sync of attendance and leave: when it ran and how many previous-month records it found changed. */
  readonly wfoSync = signal<{ at: string; changes: number } | null>(null);
  /**
   * What the WFO system now holds for previous-month days that were changed there after we first synced them.
   * ponytail: stand-in for the WFO attendance/leave API until it is connected — replace this with the real feed and syncWfo() stays as it is.
   */
  private readonly wfoFeed = signal<Record<string, { code: string; note: string }>>({});

  /** The month before the current billing period ('YYYY-MM'). */
  previousMonth(): string {
    const [y, m] = this.periodStart().split('-').map(Number);
    return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  }

  /**
   * The daily WFO sync: every previous-month record held by the WFO is compared with the one we already have. A record that differs
   * (e.g. Absent later changed to Sick Leave) is a change: its pay effect is worked out, it waits as an Addition/Deduction for the vendor's
   * next Salary claim, and the agent is told by SMS and email in Arabic and English. Returns how many changes it found.
   */
  syncWfo(): number {
    const prev = this.previousMonth();
    const [y, m] = prev.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const feed = this.wfoFeed();
    let found = 0;
    for (const a of this.agents()) {
      for (let d = 1; d <= days; d++) {
        const day = `${prev}-${String(d).padStart(2, '0')}`;
        const ours = this.attendanceOn(a, day);
        if (!ours) continue;
        const key = `${a.id}|${day}`;
        const theirs = feed[key]?.code ?? ours;
        if (theirs !== ours && this.applyPreviousMonthChange(a, day, ours, theirs, feed[key]?.note ?? '')) found++;
      }
    }
    this.wfoSync.set({ at: new Date().toISOString(), changes: found });
    if (found) this.log('WFO Sync', 'Attendance & leave', `Previous-month records compared with the WFO: ${found} change(s) affecting salary found.`, 'Success', 'System Scheduler');
    return found;
  }

  /** ponytail: a day's pay = the agent's billing rate ÷ days in that month; a paid day is anything except Absent, Maternity Leave and Off — confirm the formula with Omantel. */
  private applyPreviousMonthChange(a: Agent, day: string, original: string, code: string, note: string): boolean {
    const paid = (c: string) => (c !== 'A' && c !== 'M/L' && c !== 'OFF' ? 1 : 0);
    const [y, m] = day.split('-').map(Number);
    const delta = paid(code) - paid(original);
    const amount = Math.round((Math.abs(delta) * this.payrollFor(a).billingRate / new Date(y, m, 0).getDate()) * 1000) / 1000;
    this.pastCorrections.update((c) => ({ ...c, [`${a.id}|${day}`]: code }));
    this.log('Previous-Month Change', a.employeeId, `${a.name}, ${day}: ${original} → ${code}${note ? ' — ' + note : ''}.${delta ? ` Salary ${delta > 0 ? 'addition' : 'deduction'} of ${amount.toFixed(3)} OMR.` : ' No pay effect.'}`);
    if (!delta) return true;
    const type: AttendanceChange['type'] = delta > 0 ? 'Addition' : 'Deduction';
    const reason = `Attendance on ${day} corrected from ${LEAVE_EN[original] ?? original} to ${LEAVE_EN[code] ?? code}${note ? ' (' + note + ')' : ''}`;
    const change: AttendanceChange = { id: 'ACH-' + this.next(), agentId: a.id, employeeId: a.employeeId, agentName: a.name, vendor: a.vendor, date: day, original, updated: code, note, type, amount, reason, detectedAt: new Date().toISOString(), status: 'Pending', notifications: [] };
    change.notifications = this.notifyAgent(a, change);
    this.attendanceChanges.update((l) => [change, ...l]);
    this.notify(`${a.name}: ${type.toLowerCase()} of ${amount.toFixed(3)} OMR from a previous-month change.`, 'CSR Management', 'info', '/csr/leave');
    return true;
  }

  /** SMS and email to the agent, each carrying the English and the Arabic text: type, amount, month and reason. Simulated and logged like every other message in the demo. */
  private notifyAgent(a: Agent, c: AttendanceChange): AttendanceChange['notifications'] {
    const month = this.periodLabel(this.periodStart().slice(0, 7));
    const monthAr = new Date(this.periodStart()).toLocaleString('ar-OM', { month: 'long', year: 'numeric' });
    const en = `Dear ${a.name}, a salary ${c.type.toLowerCase()} of ${c.amount.toFixed(3)} OMR has been applied for ${month}. Reason: ${c.reason}.`;
    const ar = `عزيزي ${a.name}، تم تطبيق ${c.type === 'Addition' ? 'إضافة' : 'خصم'} على راتبك بقيمة ${c.amount.toFixed(3)} ريال عماني عن شهر ${monthAr}. السبب: تم تصحيح سجل حضورك بتاريخ ${c.date} من ${LEAVE_AR[c.original] ?? c.original} إلى ${LEAVE_AR[c.updated] ?? c.updated}.`;
    const domain = a.vendor === 'Infoline' ? 'infoline.om' : 'greenumbrella.om';
    const phone = '+968 9' + String(hash(a.id) % 10000000).padStart(7, '0');
    const sent: AttendanceChange['notifications'] = [
      { channel: 'SMS', to: phone, text: `${en}\n${ar}` },
      { channel: 'Email', to: `${a.employeeId}@agents.${domain}`, text: `Subject: Salary ${c.type.toLowerCase()} / ${c.type === 'Addition' ? 'إضافة' : 'خصم'} — ${month}\n\n${en}\n\n${ar}` },
    ];
    for (const s of sent) this.log('Agent Notified', a.employeeId, `${s.channel} to ${s.to} (English + Arabic): ${c.type} ${c.amount.toFixed(3)} OMR for ${month}.`);
    return sent;
  }

  /** The adjustments waiting for a vendor's next Salary claim, one per previous-month change not yet included in a submission. */
  pendingAdjustments(vendorName: string): InvoiceAdjustment[] {
    const short = vendorName.startsWith('Green') ? 'Green Umbrella' : vendorName.startsWith('Infoline') ? 'Infoline' : 'OJT';
    return this.attendanceChanges().filter((c) => c.status === 'Pending' && c.vendor === short).map((c) => ({ type: c.type, amount: c.amount, reason: `${c.agentName} (${c.employeeId}): ${c.reason}`, changeId: c.id }));
  }

  /** Demo: three late corrections already sitting in the WFO when the daily sync first runs. */
  private seedWfoFeed() {
    const prev = this.previousMonth();
    const [y, m] = prev.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const wanted: Array<[string, string, string]> = [['A', 'S/L', 'Medical certificate received after the month closed'], ['A', 'S/L', 'Medical certificate received after the month closed'], ['S/L', 'A', 'Sick leave not supported by a certificate']];
    const used = new Set<string>();
    const feed: Record<string, { code: string; note: string }> = {};
    for (const [from, to, note] of wanted) {
      outer: for (const a of this.agents().filter((x) => x.vendor === 'Infoline')) {
        if (used.has(a.id)) continue;
        for (let d = 1; d <= days; d++) {
          const day = `${prev}-${String(d).padStart(2, '0')}`;
          if (this.attendanceOn(a, day) === from) { used.add(a.id); feed[`${a.id}|${day}`] = { code: to, note }; break outer; }
        }
      }
    }
    this.wfoFeed.set(feed);
    this.syncWfo();
    // two more corrections reach the WFO after that first sync: the next sync (the 30-second tick, or Sync now) picks them up
    const later: Record<string, { code: string; note: string }> = { ...feed };
    const late: Array<[string, string, string]> = [['A', 'S/L', 'Hospital report submitted late'], ['S/L', 'P', 'Agent worked the day, leave cancelled']];
    for (const [from, to, note] of late) {
      outer: for (const a of this.agents().filter((x) => x.vendor === 'Green Umbrella' || x.vendor === 'Infoline')) {
        if (used.has(a.id)) continue;
        for (let d = 1; d <= days; d++) {
          const day = `${prev}-${String(d).padStart(2, '0')}`;
          if (this.attendanceOn(a, day) === from) { used.add(a.id); later[`${a.id}|${day}`] = { code: to, note }; break outer; }
        }
      }
    }
    this.wfoFeed.set(later);
  }

  /** The original file behind each import (kept as a browser link for this session), keyed `${vendor}|annexure|overtime|msIncentive|Voice|Chat`. */
  readonly importedFiles = signal<Record<string, { name: string; url: string }>>({});
  rememberFile(key: string, file: File) {
    this.importedFiles.update((m) => ({ ...m, [key]: { name: file.name, url: URL.createObjectURL(file) } }));
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

  /** The last 12 billing months, oldest first, ending with the current one ('YYYY-MM'). */
  payrollMonths(): string[] {
    const [y, m] = this.periodStart().split('-').map(Number);
    return Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(y, m - 12 + i, 1)); return d.toISOString().slice(0, 7); });
  }

  /** The agent's fixed performance rate (OMR), configured once. */
  performanceRateFor(a: Agent): number {
    const set = this.performanceRates()[a.id];
    if (set !== undefined) return set;
    const rates = [100, 100, 100, 100, 50, 50, 50, 20, 20, 40, 0]; // spread seen in the June 2026 performance sheet
    return rates[hash(a.id + '|pay') % rates.length];
  }

  setPerformanceRate(agentId: string, rate: number) {
    const a = this.agents().find((x) => x.id === agentId);
    if (!a) return;
    const before = this.performanceRateFor(a);
    if (before === rate) return;
    this.performanceRates.update((m) => ({ ...m, [agentId]: rate }));
    this.log('Performance Rate Changed', a.employeeId, `${a.name}: performance rate ${before} → ${rate} OMR.`, 'Success', undefined, { previousValue: String(before), newValue: String(rate) });
  }

  /**
   * The agent's score and overtime hours in a month (default: the current billing month).
   * ponytail: seeded stand-ins for WFO; the current month keeps the figures the rest of the demo was built on.
   */
  agentMonthFor(a: Agent, month = this.periodStart().slice(0, 7)): AgentMonth {
    const current = month === this.periodStart().slice(0, 7);
    const raw = hash(a.id + (current ? '|pay' : '|' + month));
    // a string hash barely moves between '2026-06' and '2026-07', so scramble it (murmur3 finaliser) for the other months
    const mix = (x: number) => { x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0; x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0; return (x ^ (x >>> 16)) >>> 0; };
    const h = current ? raw : mix(raw);
    const hours = [0, 0, 0, 0, 0, 0, 0, 8.5, 12, 25.5, 34, 16];
    const overtimeHours = hours[(h >>> 11) % hours.length];
    // ponytail: WFO gives us one overtime-hours total for the month, not which day each hour fell on — so the share worked on an
    // official holiday or the weekly off day is approximated from how much of the month those configured days make up.
    const holidayOvertimeHours = overtimeHours > 0 ? Math.round(overtimeHours * this.offDayShare(month) * 10) / 10 : 0;
    return { performanceScore: 84 + ((h >>> 5) % 17), overtimeHours, holidayOvertimeHours };
  }

  /** The fraction of a month's days that are the weekly off day or a configured official holiday. */
  private offDayShare(month: string): number {
    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    let offCount = 0;
    for (let d = 1; d <= daysInMonth; d++) if (this.isOffDay(`${month}-${String(d).padStart(2, '0')}`)) offCount++;
    return Math.min(offCount / daysInMonth, 0.5);
  }

  isWeeklyOff(day: string): boolean {
    return this.weeklyOffDays().includes(new Date(day).getDay());
  }

  isOfficialHoliday(day: string): boolean {
    return this.officialHolidays().some((h) => h.date === day);
  }

  isOffDay(day: string): boolean {
    return this.isWeeklyOff(day) || this.isOfficialHoliday(day);
  }

  setWeeklyOffDays(days: number[]) {
    this.weeklyOffDays.set([...new Set(days)].sort());
    this.log('Weekly Off Days Changed', 'PAYROLL-RULES', `Weekly off day(s) set to ${days.map((d) => DOW_NAMES[d]).join(', ') || 'none'} — worked on these days is paid at the holiday overtime rate.`);
  }

  addOfficialHoliday(date: string, label: string) {
    if (this.officialHolidays().some((h) => h.date === date)) return;
    this.officialHolidays.update((list) => [...list, { date, label }].sort((a, b) => a.date.localeCompare(b.date)));
    this.log('Official Holiday Added', date, `${label} (${date}) added — overtime worked that day is paid at the holiday rate.`);
  }

  removeOfficialHoliday(date: string) {
    const h = this.officialHolidays().find((x) => x.date === date);
    if (!h) return;
    this.officialHolidays.update((list) => list.filter((x) => x.date !== date));
    this.log('Official Holiday Removed', date, `${h.label} (${date}) removed.`);
  }

  /** The official-holiday overtime rate: basic ÷ days ÷ hours per day × the holiday premium — same days/hours as the ordinary formula, configurable separately in Overtime Settings. */
  formulaHolidayOvertimeRate(a: Agent, def = this.payrollRules()): number {
    const rule = this.overtimeRuleFor(a);
    const [days, hours] = rule ? [rule.days, rule.hoursPerDay] : [def.overtimeDays, def.overtimeHoursPerDay];
    return (this.payrollFor(a).basic / days / hours) * def.holidayOvertimePremium;
  }

  /** Overtime pay from the hours worked: basic ÷ days ÷ hours per day × premium × hours, with any official-holiday hours priced at the separate holiday premium instead. */
  overtimeFor(a: Agent, month?: string): { hours: number; holidayHours: number; rate: number; holidayRate: number; amount: number } {
    const { overtimeHours: hours, holidayOvertimeHours: holidayHours } = this.agentMonthFor(a, month);
    const rate = this.overtimeRateFor(a);
    const holidayRate = this.formulaHolidayOvertimeRate(a);
    const amount = Math.round(((hours - holidayHours) * rate + holidayHours * holidayRate) * 1000) / 1000;
    return { hours, holidayHours, rate, holidayRate, amount };
  }

  /** The contract an agent is billed on: their vendor's current billing contract ('—' for OJT, which has none). */
  contractOfAgent(a: Agent): string {
    const vendorName = this.contracts().find((c) => c.vendorName.startsWith(a.vendor))?.vendorName;
    return (vendorName && this.payableContracts(vendorName)[0]?.reference) || '—';
  }

  /** The most specific overtime rule that covers the agent (vendor, contract and line each count once); the latest wins a tie. */
  overtimeRuleFor(a: Agent, rules = this.overtimeRules()): OvertimeRule | undefined {
    const contract = this.contractOfAgent(a);
    let best: OvertimeRule | undefined, score = -1;
    for (const r of rules) {
      if ((r.vendor !== 'All' && r.vendor !== a.vendor) || (r.contract !== 'All' && r.contract !== contract) || (r.line !== 'All' && r.line !== a.queue)) continue;
      const s = [r.vendor, r.contract, r.line].filter((x) => x !== 'All').length;
      if (s >= score) { best = r; score = s; }
    }
    return best;
  }

  /** The formula rate: basic ÷ days ÷ hours per day × premium, from the rule that covers the agent or else the default. */
  formulaOvertimeRate(a: Agent, def = this.payrollRules()): number {
    const rule = this.overtimeRuleFor(a);
    const [days, hours, premium] = rule ? [rule.days, rule.hoursPerDay, rule.premium] : [def.overtimeDays, def.overtimeHoursPerDay, def.overtimePremium];
    return (this.payrollFor(a).basic / days / hours) * premium;
  }

  saveOvertimeRule(rule: Omit<OvertimeRule, 'id'> & { id?: string }) {
    const scope = [rule.vendor, rule.contract, rule.line].map((x) => (x === 'All' ? 'any' : x)).join(' / ');
    const same = this.overtimeRules().find((r) => r.id !== rule.id && r.vendor === rule.vendor && r.contract === rule.contract && r.line === rule.line);
    const id = rule.id ?? same?.id ?? 'OTR-' + this.next();
    this.overtimeRules.update((list) => [...list.filter((r) => r.id !== id), { ...rule, id }]);
    this.log('Overtime Rule Saved', id, 'Vendor / contract / line ' + scope + ': basic ÷ ' + rule.days + ' ÷ ' + rule.hoursPerDay + ' × ' + rule.premium + '.');
  }

  deleteOvertimeRule(id: string) {
    const r = this.overtimeRules().find((x) => x.id === id);
    if (!r) return;
    this.overtimeRules.update((list) => list.filter((x) => x.id !== id));
    this.log('Overtime Rule Deleted', id, 'Vendor / contract / line ' + [r.vendor, r.contract, r.line].map((x) => (x === 'All' ? 'any' : x)).join(' / ') + ' removed; those agents follow the default again.');
  }

  /** The agent's own overtime rate if one was set, otherwise the formula rate. */
  overtimeRateFor(a: Agent): number {
    return this.overtimeRates()[a.id] ?? this.formulaOvertimeRate(a);
  }

  /** Sets an agent's own overtime rate, or clears it (null) so they follow the formula again. */
  setOvertimeRate(agentId: string, rate: number | null) {
    const a = this.agents().find((x) => x.id === agentId);
    if (!a) return;
    const before = this.overtimeRateFor(a);
    this.overtimeRates.update((m) => { const { [agentId]: _old, ...rest } = m; return rate === null ? rest : { ...rest, [agentId]: rate }; });
    const after = this.overtimeRateFor(a);
    this.log('Overtime Rate Changed', a.employeeId, a.name + ': overtime rate ' + before.toFixed(3) + ' → ' + after.toFixed(3) + ' OMR/hour' + (rate === null ? ' (back to the formula)' : '') + '.', 'Success', undefined, { previousValue: before.toFixed(3), newValue: after.toFixed(3) });
  }

  /** The agent earns their performance rate in a month only when that month's score is above the threshold for their nationality. */
  performanceFor(a: Agent, month?: string): { rate: number; score: number; threshold: number; omani: boolean; eligible: boolean; amount: number } {
    const r = this.payrollRules(), rate = this.performanceRateFor(a), score = this.agentMonthFor(a, month).performanceScore;
    const omani = /^oman/i.test(a.nationality ?? 'Oman');
    const threshold = omani ? r.omaniMinScore : r.nonOmaniMinScore;
    const eligible = score > threshold;
    return { rate, score, threshold, omani, eligible, amount: eligible ? rate : 0 };
  }

  savePayrollRules(rules: PayrollRules) {
    const r = this.payrollRules();
    this.payrollRules.set(rules);
    this.log('Payroll Rules Saved', 'PAYROLL-RULES', `Performance: Omani above ${rules.omaniMinScore}%, non-Omani above ${rules.nonOmaniMinScore}% (was ${r.omaniMinScore}% / ${r.nonOmaniMinScore}%). Overtime: basic ÷ ${rules.overtimeDays} ÷ ${rules.overtimeHoursPerDay} × ${rules.overtimePremium} (× ${rules.holidayOvertimePremium} on an official holiday).`);
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

    const agentRows: AgentBillRow[] = [];
    const absentees: Array<{ agent: Agent; absentDays: number; rate: number; deduction: number }> = [];
    let absentDays = 0;
    const tiers = (['Bachelor', 'Diploma', 'Non-Diploma'] as const).map((degree) => {
      const group = existing.filter((a) => a.degree === degree);
      let gross = 0, amount = 0, factorSum = 0, payroll = 0, fee = 0, overtime = 0, overtimeHours = 0, performance = 0, qualified = 0;
      for (const a of group) {
        const pay = this.payrollFor(a);
        const codes = att[a.id] ?? [];
        const expected = codes.filter((c) => c !== 'OFF').length;
        const billable = codes.filter((c) => c !== 'OFF' && c !== 'A' && c !== 'M/L').length;
        const absent = codes.filter((c) => c === 'A').length;
        const maternity = codes.filter((c) => c === 'M/L').length;
        const factor = expected ? billable / expected : 0;
        const flatFee = Math.min(pay.managementFee, FLAT_MANAGEMENT_FEE);
        gross += pay.billingRate; amount += pay.billingRate * factor; factorSum += factor;
        agentRows.push({ agent: a, kind: 'existing', rate: pay.billingRate, expected, billable, absent, maternity, amount: pay.billingRate * factor, codes });
        const ot = this.overtimeFor(a), perf = this.performanceFor(a);
        overtime += ot.amount; overtimeHours += ot.hours; performance += perf.amount; if (perf.eligible) qualified++; fee += flatFee; payroll += pay.billingRate - flatFee;
        if (absent + maternity) {
          absentDays += absent + maternity;
          absentees.push({ agent: a, absentDays: absent + maternity, rate: pay.billingRate, deduction: expected ? (pay.billingRate * (absent + maternity)) / expected : 0 });
        }
      }
      return { degree, headcount: group.length, rate: group.length ? gross / group.length : 0, gross, payroll, fee, billableFte: factorSum, amount, overtime, overtimeHours, performance, qualified, salaryAmount: amount };
    });
    const gross = tiers.reduce((s, t) => s + t.gross, 0);
    const base = tiers.reduce((s, t) => s + t.amount, 0);
    const overtimeBase = tiers.reduce((s, t) => s + t.overtime, 0);
    const performanceBase = tiers.reduce((s, t) => s + t.performance, 0);
    const salaryBase = base;
    const absenceDeduction = gross - base;

    const newJoiners = joiners.map((a) => {
      const pay = this.payrollFor(a);
      const day = Math.min(daysInMonth, Math.max(1, parseInt(a.joinDate.slice(8, 10), 10) || 1));
      const daysBilled = daysInMonth - day + 1;
      return { agent: a, pay, daysBilled, prorated: (pay.billingRate * daysBilled) / daysInMonth };
    });
    for (const j of newJoiners) agentRows.push({ agent: j.agent, kind: 'joiner', rate: j.pay.billingRate, expected: daysInMonth, billable: j.daysBilled, absent: 0, maternity: 0, amount: j.prorated, codes: att[j.agent.id] ?? [] });
    const newJoining = { units: newJoiners.length, amount: newJoiners.reduce((s, j) => s + j.prorated, 0) };

    const resignationRecords = this.resignations().filter((r) => r.vendor === key && r.resignDate.startsWith(monthPrefix));
    const resignation = { units: resignationRecords.length, amount: resignationRecords.reduce((s, r) => s + r.total, 0) };

    const threshold = this.payableRules().thresholdSeconds;
    const sampleCalls = all.length * 260;
    const excludedCalls = Math.round(sampleCalls * Math.min(0.6, threshold / 60));
    const eligibleCalls = sampleCalls - excludedCalls;
    const incentive = Math.round(eligibleCalls * 0.05 * 100) / 100;
    const incentiveIncluded = this.payableRules().includeIncentive;
    const subtotal = base + overtimeBase + performanceBase + newJoining.amount + resignation.amount + (incentiveIncluded ? incentive : 0);
    const vat = subtotal * 0.05;
    return { vendorName, existing, agentRows, tiers, gross, base, salaryBase, overtimeBase, performanceBase, absenceDeduction, absentDays, absentees, newJoiners, newJoining, resignationRecords, resignation, sampleCalls, excludedCalls, eligibleCalls, incentive, incentiveIncluded, subtotal, vat, total: subtotal + vat, threshold };
  }

  /** The vendor's contracts that run in the billing month, the one its agents are billed on (the active contract ending last) first. */
  payableContracts(vendorName: string): Array<Contract & { billing: boolean }> {
    const start = this.periodStart(), end = addMonthsIso(start, 1);
    const list = this.contracts()
      .filter((c) => c.vendorName === vendorName && c.status !== 'Cancelled' && c.startDate < end && c.endDate >= start)
      .sort((a, b) => b.endDate.localeCompare(a.endDate));
    return list.map((c, i) => ({ ...c, billing: i === 0 }));
  }

  /** A PO line's Yearly Budget entries are identical across contract-years (same name/scope, only the amount differs), so year 1 stands for all of them. */
  private currentLines(c: Contract) {
    const kids = childRecordsFor(c);
    return yearlyBudgetFor(c, kids)[0]?.lines ?? [];
  }

  /** First-run guess at each line's component, by name (Salary/Overtime/Performance/Incentive/Management fee) — a starting point the user can change on Payable Line Mapping. */
  private seedLineMapping(): Record<string, WfoComponent> {
    const guess: Array<[RegExp, WfoComponent]> = [[/^salary$/i, 'salary'], [/^over ?time$/i, 'overtime'], [/^performance$/i, 'performance'], [/^incentive$/i, 'incentive'], [/management fee/i, 'fee'], [/^voice$/i, 'voice'], [/^chat$/i, 'chat'], [/manage ?service incentive/i, 'msIncentive'], [/^yearly performance$/i, 'yearlyPerformance'], [/^project$/i, 'project']];
    const map: Record<string, WfoComponent> = {};
    for (const c of this.contracts().filter((x) => x.status !== 'Cancelled')) {
      for (const l of this.currentLines(c)) {
        const hit = guess.find(([re]) => re.test(l.description));
        if (hit) map[`${c.reference}|L${l.line}`] = hit[1];
      }
    }
    return map;
  }

  /** Every PO line of every active contract, and which calculated component (if any) it is linked to — the full list for Payable Line Mapping. */
  payableLineCatalog(): PayableLineCatalogItem[] {
    const mapping = this.lineMapping();
    const customs = this.customInvoiceItems();
    return this.contracts()
      .filter((c) => c.status !== 'Cancelled')
      .sort((a, b) => infolineFirst(a.vendorName, b.vendorName) || a.reference.localeCompare(b.reference))
      .flatMap((c) => [
        ...this.currentLines(c).map((l): PayableLineCatalogItem => {
          const key = `${c.reference}|L${l.line}`;
          return { key, vendorName: c.vendorName, contractRef: c.reference, contractName: c.name, label: l.description, scope: l.scope, component: mapping[key] ?? null };
        }),
        ...customs.filter((i) => i.contractRef === c.reference).map((i): PayableLineCatalogItem => {
          const key = `${c.reference}|C${i.id}`;
          return { key, vendorName: c.vendorName, contractRef: c.reference, contractName: c.name, label: i.label, scope: i.scope, component: mapping[key] ?? i.component ?? null };
        }),
      ]);
  }

  /** Links (or unlinks) one PO line to a calculated component from the Payable Line Mapping screen. */
  setLineMapping(key: string, component: WfoComponent | null) {
    this.lineMapping.update((m) => {
      const n = { ...m };
      if (component) n[key] = component; else delete n[key];
      return n;
    });
    this.invoiceRuns.set({});
    this.log('Payable Line Mapping Changed', key, component ? `Linked to ${WFO_LABEL[component]}. Invoices must be re-validated.` : 'Unlinked — this line goes back to its contract share. Invoices must be re-validated.');
  }

  /** Adds a new invoice item by hand, alongside whatever PO lines the ERP already has for the contract. */
  addInvoiceItem(input: { contractRef: string; vendorName: string; label: string; scope: string; allocated: number; component: WfoComponent | null }): string {
    const id = 'CI-' + this.next();
    const item: CustomInvoiceItem = { ...input, id, createdAt: new Date().toISOString(), createdBy: CURRENT_USER };
    this.customInvoiceItems.update((list) => [...list, item]);
    if (input.component) this.setLineMapping(`${input.contractRef}|C${id}`, input.component);
    this.log('Invoice Item Created', input.label, `${input.vendorName} · ${input.contractRef}: ${input.allocated.toLocaleString('en-GB')} OMR/year${input.component ? ', linked to ' + WFO_LABEL[input.component] : ', contract share'}.`);
    this.notify(`New invoice item "${input.label}" added for ${input.vendorName}.`, 'Invoicing & Payments', 'info', '/invoicing/reconciliation');
    return id;
  }

  removeInvoiceItem(id: string) {
    const item = this.customInvoiceItems().find((i) => i.id === id);
    if (!item) return;
    this.customInvoiceItems.update((list) => list.filter((i) => i.id !== id));
    this.setLineMapping(`${item.contractRef}|C${id}`, null);
    this.log('Invoice Item Removed', item.label, `${item.vendorName} · ${item.contractRef}.`);
  }

  /**
   * What the vendor can invoice on one contract this month: one line per line of the contract's PO. On the billing contract,
   * a line linked (on Payable Line Mapping) to Salary, Overtime, Performance, Incentive or Management fee takes that calculated
   * figure, and any calculated component with no line linked to it is added as its own line so nothing billed is lost. Every
   * other line is the contract's monthly share of its yearly budget.
   */
  payableLines(vendorName: string, contractRef: string): PayableLineItem[] {
    const c = this.contracts().find((x) => x.reference === contractRef && x.vendorName === vendorName);
    if (!c) return [];
    const billing = this.payableContracts(vendorName)[0]?.reference === contractRef;
    const kids = childRecordsFor(c);
    const period = this.periodStart();
    const year = yearlyBudgetFor(c, kids).find((y) => y.startDate <= period && y.endDate >= period) ?? yearlyBudgetFor(c, kids).slice(-1)[0];
    const months = year ? Math.max(1, Math.round((new Date(year.endDate).getTime() - new Date(year.startDate).getTime()) / 2629800000)) : 1;
    const mapping = this.lineMapping();
    const buildLine = (key: string, label: string, allocated: number, shareBasis: string): PayableLineItem => {
      const mapped = mapping[key];
      const txChannel: TxChannel | undefined = mapped === 'voice' ? 'Voice' : mapped === 'chat' ? 'Chat' : undefined;
      const tx = txChannel ? this.transactionInvoiceFor(vendorName, txChannel) : undefined;
      const isMsIncentive = mapped === 'msIncentive';
      const msi = isMsIncentive ? this.msIncentiveInvoices()[vendorName]?.[0] : undefined;
      const isYearlyPerf = mapped === 'yearlyPerformance';
      const isProject = mapped === 'project';
      const share = Math.round((allocated / months) * 1000) / 1000;
      const calculated = txChannel ? (tx?.totalInvoicedAmount ?? 0) : isMsIncentive ? (msi?.total ?? 0) : share;
      const basis = txChannel
        ? (tx ? `From the imported ${txChannel} transaction invoice (${tx.fileName}) — ${tx.invoicedTransactions.toLocaleString('en-GB')} invoiced transactions × ${tx.rate} OMR` : `No ${txChannel} invoice imported yet — nothing to calculate until one is.`)
        : isMsIncentive
        ? (msi ? `From the imported Manage Service Incentive file (${msi.fileName}) — ${msi.rows.length} categor${msi.rows.length === 1 ? 'y' : 'ies'}` : 'No Manage Service Incentive file imported yet — nothing to calculate until one is.')
        : isYearlyPerf || isProject
        ? 'Entered manually each month — no file, no independent calculation; whatever is entered is taken as our figure.'
        : shareBasis;
      return { key, label, calculated, source: 'contract' as const, component: txChannel || isMsIncentive || isYearlyPerf || isProject ? mapped : undefined, txChannel, msIncentive: isMsIncentive || undefined, basis };
    };
    const lines: PayableLineItem[] = (year?.lines ?? []).map((l) =>
      buildLine(`${c.reference}|L${l.line}`, l.description, l.allocated, `${year!.description.split(' — ')[0]} allocation ${l.allocated.toLocaleString('en-GB')} OMR ÷ ${months} month${months === 1 ? '' : 's'}`));
    // Invoice items added manually from "Create Invoice Item" — their own approved yearly allocation, on top of the ERP's PO lines.
    for (const item of this.customInvoiceItems().filter((i) => i.contractRef === contractRef)) {
      lines.push(buildLine(`${c.reference}|C${item.id}`, item.label, item.allocated, `Approved allocation ${item.allocated.toLocaleString('en-GB')} OMR/year ÷ ${months} month${months === 1 ? '' : 's'}`));
    }
    if (!billing) return lines;

    const calc = this.calculateInvoice(vendorName);
    const fee = calc.tiers.reduce((sum, t) => sum + t.fee, 0);
    const linkedTo = (component: WfoComponent) => lines.find((l) => mapping[l.key] === component);
    const hasFeeLine = !!linkedTo('fee');
    const wfo: Array<{ component: WfoComponent; label: string; amount: number; note?: string }> = [
      { component: 'salary', label: 'Salary', amount: calc.salaryBase + calc.newJoining.amount + calc.resignation.amount - (hasFeeLine ? fee : 0) },
      { component: 'overtime', label: 'Overtime', amount: calc.overtimeBase },
      { component: 'performance', label: 'Performance', amount: calc.performanceBase },
      { component: 'incentive', label: 'Incentive', amount: calc.incentive, note: calc.incentiveIncluded ? undefined : 'Not on the vendor invoice by the current payable rule' },
      ...(hasFeeLine ? [{ component: 'fee' as WfoComponent, label: 'Management fee', amount: fee }] : []),
    ];
    for (const w of wfo) {
      const hit = linkedTo(w.component);
      const patch = { calculated: Math.round(w.amount * 1000) / 1000, source: 'wfo' as const, component: w.component, note: w.note, basis: undefined };
      if (hit) Object.assign(hit, patch);
      else lines.push({ key: `${c.reference}|${w.component}`, label: w.label, ...patch });
    }
    return lines;
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

  /**
   * Reads the vendor's annexure file purely for comparison — it is never a replacement for our own data. Our agents, payroll and
   * attendance come from the WFO (synced daily) and are untouched by an import; only the vendor's claimed amount per component,
   * from their own file's billing rates and attendance, is kept, so it can be diffed against our WFO calculation.
   */
  importAnnexure(d: AnnexureImport) {
    const vendorName = 'Infoline LLC';
    const claim = this.claimFromAnnexure(d);
    const total = Object.values(claim).reduce((s, v) => s + (v ?? 0), 0);
    this.vendorAnnexures.update((m) => ({ ...m, [vendorName]: { fileName: d.fileName, importedAt: new Date().toISOString(), period: this.period(), employees: d.employees.length, days: d.attendance.days.length, resignations: d.resignations.length, claim, total, ...this.annexureBreakdown(d) } }));
    this.importInfo.set({ fileName: d.fileName, employees: d.employees.length, days: d.attendance.days.length, resignations: d.resignations.length, period: this.period() });
    this.log('Annexure Imported', d.fileName, `${d.employees.length} employee line(s), ${d.attendance.days.length} attendance days and ${d.resignations.length} resignation(s) compared against our WFO calculation for ${this.period()}. Our own agent, payroll and attendance data is unchanged.`);
    this.notify(`${d.fileName} loaded — comparing the vendor's claimed amount against our calculation for ${this.period()}.`, 'Invoicing & Payments', 'green', '/invoicing/reconciliation');
  }

  /** The vendor's own figures per tier, from their file, so a Salary or Overtime difference can be located. */
  private annexureBreakdown(d: AnnexureImport) {
    const monthPrefix = d.periodStart.slice(0, 7);
    const tiers = ['Bachelor', 'Diploma', 'Non-Diploma'].map((degree) => ({ degree, agents: 0, fte: 0, salary: 0, overtime: 0 }));
    const joiners = { agents: 0, salary: 0 };
    const people: VendorPerson[] = [];
    for (const e of d.employees) {
      const codes = d.attendance.rows[e.employeeId] ?? [];
      const expected = codes.filter((c) => c !== 'OFF').length, billable = codes.filter((c) => c !== 'OFF' && c !== 'A').length;
      const factor = expected ? billable / expected : 1, salary = e.pay.billingRate * factor;
      const joiner = e.joinDate.startsWith(monthPrefix);
      people.push({ employeeId: String(e.employeeId).trim(), name: e.name, queue: e.queue, degree: e.degree, joinDate: e.joinDate, rate: e.pay.billingRate, expected, billable, absent: codes.filter((c) => c === 'A').length, maternity: codes.filter((c) => c === 'M/L').length, codes, amount: Math.round(salary * 1000) / 1000, overtime: e.pay.additional, joiner });
      const t = tiers.find((x) => x.degree === e.degree);
      if (t) t.overtime += e.pay.additional;
      if (joiner) { joiners.agents++; joiners.salary += salary; continue; }
      if (t) { t.agents++; t.fte += factor; t.salary += salary; }
    }
    const resignationRows = d.resignations.map((r) => ({ employeeId: String(r.employeeId).trim(), name: r.name, queue: r.queue, degree: r.degree, total: r.total, resignDate: r.resignDate }));
    return { tiers, joiners, people, resignationRows, resignationTotal: d.resignations.reduce((sum, r) => sum + r.total, 0) };
  }

  /**
   * Employee by employee: what the vendor's annexure bills for each person against what we calculate, matched on employee ID.
   * Says who differs, by how much, and why (billing rate, absent days, joining) — plus people on only one side. Null until an annexure is imported.
   */
  annexureEmployees(vendorName: string): { fileName: string; rows: EmployeeCompareRow[] } | null {
    const a = this.vendorAnnexures()[vendorName];
    if (!a?.people) return null;
    const calc = this.calculateInvoice(vendorName);
    const r3 = (n: number) => Math.round(n * 1000) / 1000, f3 = (n: number) => n.toFixed(3);
    const ours = new Map(calc.agentRows.map((r) => [String(r.agent.employeeId).trim(), r]));
    const rows: EmployeeCompareRow[] = [];
    const seen = new Set<string>();
    const copies = new Map<string, VendorPerson[]>();
    for (const v of a.people) copies.set(v.employeeId, [...(copies.get(v.employeeId) ?? []), v]);
    for (const list of copies.values()) {
      const v = list.length > 1 ? { ...list[0], amount: Math.round(list.reduce((t, x) => t + x.amount, 0) * 1000) / 1000 } : list[0];
      const dup = list.length;
      seen.add(v.employeeId);
      const o = ours.get(v.employeeId);
      if (!o) { rows.push({ key: 'S|' + v.employeeId, employeeId: v.employeeId, name: v.name, queue: v.queue, degree: v.degree, kind: 'Salary', status: 'Only on vendor annexure', ours: 0, theirs: v.amount, diff: v.amount, reasons: ["Billed by the vendor, but not an active agent in our WFO this month"], days: [] }); continue; }
      const diff = r3(v.amount - o.amount), reasons: string[] = [];
      const days: EmployeeCompareRow['days'] = [];
      if (v.codes.length && v.codes.length === o.codes.length) o.codes.forEach((c, i) => { if (c !== v.codes[i]) days.push({ day: i + 1, vendor: v.codes[i], ours: c }); });
      if (Math.abs(diff) >= 0.005) {
        if (Math.abs(v.rate - o.rate) >= 0.0005) reasons.push(`Billing rate: vendor ${f3(v.rate)}, ours ${f3(o.rate)}`);
        if (v.absent !== o.absent) reasons.push(`Absent days: vendor ${v.absent}, ours ${o.absent}`);
        if (v.expected !== o.expected) reasons.push(`Working days: vendor ${v.expected}, ours ${o.expected}`);
        if (v.joiner !== (o.kind === 'joiner')) reasons.push(v.joiner ? 'The vendor bills a new joiner; we bill a full month' : 'We bill a new joiner pro-rata; the vendor bills a full month');
        if (o.maternity > 0 && v.billable > o.billable) reasons.push(`Maternity leave is not payable: ${o.maternity} day${o.maternity > 1 ? 's' : ''}`);
        if (!reasons.length) reasons.push('The amounts differ');
      }
      if (dup > 1) reasons.unshift(`Duplicated ${dup} times in the vendor annexure — a record cannot be paid twice`);
      rows.push({ key: 'S|' + v.employeeId, employeeId: v.employeeId, name: v.name || o.agent.name, queue: v.queue || o.agent.queue, degree: v.degree, kind: 'Salary', status: Math.abs(diff) >= 0.005 || dup > 1 ? 'Different' : 'Matches', ours: r3(o.amount), theirs: v.amount, diff, reasons, days });
    }
    for (const [id, o] of ours) if (!seen.has(id)) rows.push({ key: 'S|' + id, employeeId: id, name: o.agent.name, queue: o.agent.queue, degree: o.agent.degree, kind: 'Salary', status: 'Only in our WFO', ours: r3(o.amount), theirs: 0, diff: -r3(o.amount), reasons: ['In our WFO, but missing from the vendor annexure — not billed'], days: [] });
    // resignations
    const oursRes = new Map(calc.resignationRecords.map((r) => [String(r.employeeId).trim(), r]));
    const seenRes = new Set<string>();
    for (const v of a.resignationRows) {
      seenRes.add(v.employeeId);
      const o = oursRes.get(v.employeeId);
      const oursTotal = o ? r3(o.total) : 0, diff = r3(v.total - oursTotal);
      rows.push({ key: 'R|' + v.employeeId, employeeId: v.employeeId, name: v.name, queue: v.queue, degree: v.degree, kind: 'Resignation', status: !o ? 'Only on vendor annexure' : Math.abs(diff) >= 0.005 ? 'Different' : 'Matches', ours: oursTotal, theirs: r3(v.total), diff, reasons: !o ? ['A resignation the vendor bills, that is not in our records'] : Math.abs(diff) >= 0.005 ? ['Pro-rata days or leave encashment differ'] : [], days: [] });
    }
    for (const [id, o] of oursRes) if (!seenRes.has(id)) rows.push({ key: 'R|' + id, employeeId: id, name: o.name, queue: o.queue, degree: o.degree, kind: 'Resignation', status: 'Only in our WFO', ours: r3(o.total), theirs: 0, diff: -r3(o.total), reasons: ['A resignation in our records that the vendor did not bill'], days: [] });
    rows.sort((x, y) => Number(y.status !== 'Matches') - Number(x.status !== 'Matches') || Math.abs(y.diff) - Math.abs(x.diff) || x.name.localeCompare(y.name));
    return { fileName: a.fileName, rows };
  }

  /** Employees that appear more than once on the vendor's annexure: a duplicated record cannot be validated. */
  annexureDuplicates(vendorName: string): Array<{ name: string; employeeId: string; times: number }> {
    const people = this.vendorAnnexures()[vendorName]?.people ?? [];
    const n = new Map<string, { name: string; times: number }>();
    for (const p of people) n.set(p.employeeId, { name: p.name, times: (n.get(p.employeeId)?.times ?? 0) + 1 });
    return [...n].filter(([, v]) => v.times > 1).map(([employeeId, v]) => ({ employeeId, ...v }));
  }

  /** Where a Salary or Overtime difference sits: our figure and the vendor's annexure figure, part by part. Null until their annexure is imported. */
  annexureCompare(vendorName: string, component: WfoComponent | undefined, feeSeparate = false): { fileName: string; rows: AnnexureCompareRow[] } | null {
    const a = this.vendorAnnexures()[vendorName];
    if (!a || (component !== 'salary' && component !== 'overtime')) return null;
    const c = this.calculateInvoice(vendorName);
    const rows: AnnexureCompareRow[] = c.tiers.map((t) => {
      const v = a.tiers.find((x) => x.degree === t.degree);
      return component === 'salary'
        ? { label: `${t.degree} tier`, ours: t.salaryAmount, theirs: v?.salary ?? 0, oursDetail: `${t.headcount} agents · ${t.billableFte.toFixed(2)} billable FTE`, theirsDetail: `${v?.agents ?? 0} agents · ${(v?.fte ?? 0).toFixed(2)} billable FTE` }
        : { label: `${t.degree} tier`, ours: t.overtime, theirs: v?.overtime ?? 0, oursDetail: `${t.headcount} agents · ${t.overtimeHours.toLocaleString('en-GB')} h`, theirsDetail: `${v?.agents ?? 0} agents` };
    });
    if (component === 'salary') {
      rows.push({ label: 'New joiners', ours: c.newJoining.amount, theirs: a.joiners.salary, oursDetail: `${c.newJoining.units} agent(s), pro-rata`, theirsDetail: `${a.joiners.agents} agent(s)` });
      rows.push({ label: 'Resignations', ours: c.resignation.amount, theirs: a.resignationTotal, oursDetail: `${c.resignation.units} record(s)`, theirsDetail: `${a.resignations} record(s)` });
      if (feeSeparate) rows.push({ label: 'Management fee (billed on its own line)', ours: -c.tiers.reduce((sum, t) => sum + t.fee, 0), theirs: 0, oursDetail: 'taken out of Salary', theirsDetail: 'inside their billing rate' });
    }
    return { fileName: a.fileName, rows };
  }

  /** The vendor's claimed Salary (their billing rate × their own attendance factor, plus their resignations) and Overtime ("Additional") from their file. */
  private claimFromAnnexure(d: AnnexureImport): Partial<Record<WfoComponent, number>> {
    let salary = 0, overtime = 0;
    for (const e of d.employees) {
      const codes = d.attendance.rows[e.employeeId] ?? [];
      const expected = codes.filter((c) => c !== 'OFF').length;
      const billable = codes.filter((c) => c !== 'OFF' && c !== 'A').length;
      const factor = expected ? billable / expected : 1;
      salary += e.pay.billingRate * factor;
      overtime += e.pay.additional;
    }
    const resignation = d.resignations.reduce((s, r) => s + r.total, 0);
    return { salary: Math.round((salary + resignation) * 1000) / 1000, overtime: Math.round(overtime * 1000) / 1000 };
  }

  /** The vendor's claimed amount for one payable component, from their imported annexure file — undefined until one is imported. */
  vendorClaim(vendorName: string, component?: WfoComponent): number | undefined {
    return component ? this.vendorAnnexures()[vendorName]?.claim[component] : undefined;
  }

  /** The latest validation of one payable line this period, if any (each run covers exactly one line). */
  lineRun(vendorName: string, key: string): InvoiceRun | undefined {
    const runs = (this.invoiceRuns()[vendorName] ?? []).filter((r) => r.period === this.period() && r.lines[0]?.key === key);
    return runs[runs.length - 1];
  }

  /** Validates one line or several at once; each line is checked against the tolerance on its own. Approved lines are skipped. */
  validateLines(vendorName: string, lines: InvoiceLineDetail[]) {
    const tol = this.payableRules().deviationPct;
    const todo = lines.filter((l) => !['Approved for payment', 'Submitted for approval'].includes(this.lineRun(vendorName, l.key)?.status ?? ''));
    const runs: InvoiceRun[] = todo.map((l) => {
      const variancePct = l.calculated ? ((l.vendorAmount - l.calculated) / l.calculated) * 100 : 0;
      return { vendor: vendorName, period: this.period(), lines: [l], calculatedTotal: l.calculated, vendorInvoiceAmount: l.vendorAmount, variancePct, status: (Math.abs(l.vendorAmount - l.calculated) >= 0.0005 && Math.abs(variancePct) > tol) || (l.key.endsWith('|salary') && this.annexureDuplicates(vendorName).length) ? 'Flagged for review' : 'Validated' };
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

  /** Approves lines the vendor has submitted, one or several at once; together they become one payment, with the documents the vendor attached. */
  approveLines(vendorName: string, keys: string[], contractRef: string) {
    const runs = keys.map((k) => this.lineRun(vendorName, k)).filter((r): r is InvoiceRun => r?.status === 'Submitted for approval');
    if (!runs.length) return;
    const documents = runs.flatMap((r) => r.documents ?? []).filter((d, i, all) => all.findIndex((x) => x.name === d.name) === i);
    const names = runs.map((r) => r.lines[0].label).join(', ');
    const net = runs.flatMap((r) => r.adjustments ?? []).reduce((t, a) => t + (a.type === 'Addition' ? a.amount : -a.amount), 0);
    const amount = runs.reduce((sum, r) => sum + r.vendorInvoiceAmount, 0) + net;
    const mapping = this.lineMapping();
    const items = runs.map((r) => {
      const l = r.lines[0], tail = l.key.split('|')[1] as WfoComponent;
      const comp = mapping[l.key] ?? (WFO_COMPONENTS.includes(tail) ? tail : undefined);
      return { label: l.label, linkedTo: comp ? WFO_LABEL[comp] : undefined };
    });
    const payment: PaymentRecord = { id: 'PAY-' + this.next(), vendorName, lines: `${contractRef} · ${names}`, contract: contractRef, poNumber: this.contracts().find((c) => c.reference === contractRef)?.poNumber, items, documents, pendingAt: 'Finance approval', invoiceAmount: Math.round(amount), status: 'Pending', slaAtRisk: false, invoiceRef: 'INV-' + this.next(), period: this.period() };
    this.payments.update((list) => [payment, ...list]);
    this.invoiceRuns.update((m) => ({ ...m, [vendorName]: (m[vendorName] ?? []).map((r) => (runs.includes(r) ? { ...r, status: 'Approved for payment', paymentId: payment.id } : r)) }));
    this.log('Invoice Approved', vendorName, `${contractRef} · ${names}: approved for payment, ${payment.invoiceAmount.toLocaleString()} OMR (${payment.id}). ${documents.length} document(s) attached: ${documents.map((d) => d.kind === 'Other' ? d.name : d.kind).join(', ')}.`);
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
    const email = status === 'Completed' ? (VENDOR_CONTACT[p.vendorName] ?? 'accounts@vendor.example') : undefined;
    this.payments.update((list) => list.map((x) => (x.id === id ? { ...x, status, slaAtRisk: status === 'Completed' ? false : x.slaAtRisk, paymentDate: status === 'Completed' ? isoDay(0) : undefined, receiptNumber: status === 'Completed' ? 'RCT-' + this.next() : x.receiptNumber, requisitionNumber: status === 'Completed' ? 'REQ-' + this.next() : x.requisitionNumber, vendorEmail: email ?? x.vendorEmail, emailSentAt: status === 'Completed' ? new Date().toISOString() : x.emailSentAt } : x)));
    this.log('Payment Status Changed', id, `${p.vendorName}: ${p.status} → ${status}.`);
    if (status === 'Completed') {
      const docs = (p.documents ?? []).map((d) => d.kind).join(', ') || 'no attachments';
      this.log('Vendor Emailed', p.vendorName, `Payment completion sent to ${email} with ${docs}.`);
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
    return this.periodLabel(this.periodStart().slice(0, 7));
  }

  /** Formats any 'YYYY-MM' as "September 2026" — for the current period (period()) or a month picked from payrollMonths(). */
  periodLabel(monthPrefix: string): string {
    const [y, m] = monthPrefix.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  }

  // ---------- internals ----------
  private next() {
    return ++this.seq;
  }

  /** System Admin has everything; Vendor and Billing get only what ROLE_GRANTS lists — editable afterwards on Access Control. */
  private seedPermissions(): Record<string, boolean> {
    const grid: Record<string, boolean> = {};
    for (const p of PERMISSIONS) for (const r of ROLES) grid[`${p.permission}|${r}`] = r === 'System Admin' || (ROLE_GRANTS[r] ?? []).includes(p.permission);
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
    const ref = new Map(WFO_REFERENCE.employees.map((e) => ['AG-' + e.id, e.p]));
    for (const a of this.agents()) rec[a.id] = ref.get(a.id) ?? this.makePayroll(a.id, a.degree);
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
    return WFO_REFERENCE.resignations.map((r) => ({ id: 'RES-' + this.next(), vendor: 'Infoline', ...r }));
  }

  /**
   * An agent's attendance code on any day: the live WFO window (the last 14 days, editable) when the day is in it, otherwise
   * their history. Blank before they joined and after today.
   * ponytail: history is seeded from the agent and the date until WFO's archive is connected.
   */
  attendanceOn(a: Agent, day: string): string {
    const i = this.attendanceDays().indexOf(day);
    if (i >= 0) return this.attendance()[a.id]?.[i] ?? '';
    if (day > isoDay(0) || day < a.joinDate) return '';
    return this.pastCorrections()[a.id + '|' + day] ?? this.historyCode(a, day);
  }

  /** The archived code for a past day, as the WFO first reported it. */
  private historyCode(a: Agent, day: string): string {
    if (this.isOffDay(day)) return 'OFF';
    const h = hash(a.id + '|' + day) % 100;
    return h < 3 ? 'A' : h < 7 ? 'S/L' : h < 11 ? 'C/L' : 'P';
  }

  private seedAttendance(): Record<string, string[]> {
    const rec: Record<string, string[]> = {};
    const agents = this.agents();
    const ref = new Map(WFO_REFERENCE.employees.filter((e) => e.a).map((e) => ['AG-' + e.id, e.a.split(',')]));
    agents.forEach((a, i) => {
      if (ref.has(a.id)) { rec[a.id] = ref.get(a.id)!; return; }
      rec[a.id] = this.attendanceDays().map((day, d) => {
        if (this.isOffDay(day)) return 'OFF';
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
