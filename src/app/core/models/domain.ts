import { StatusLevel } from './status';

// ---------- Contracts & Budget ----------
export interface Contract {
  id: string;
  reference: string;
  name: string;
  recordType: 'Contract' | 'Variation Order' | 'Amendment' | 'Time Extension';
  parentReference?: string;
  contractType: string;
  vendorName: string;
  startDate: string;
  endDate: string;
  amount: number;
  currency: 'OMR' | 'USD';
  status: 'Active' | 'Expiring Soon' | 'Expired' | 'Cancelled';
  renewalStatus?: string;
  erpReference: string;
  lastSyncedAt: string;
  daysRemaining: number;
  // ERP / commercial details (filled in by the ERP sync)
  description?: string;
  scope?: string[];
  department?: string;
  contractManager?: string;
  paymentTerms?: string;
  signedDate?: string;
  signatory?: string;
  renewalOption?: string;
  erpVendorId?: string;
  erpStatus?: string;
  erpCreatedAt?: string;
  erpModifiedAt?: string;
  poNumber?: string;
}

export interface BudgetLine {
  id: string;
  category: 'Total Budget' | 'Petty Cash' | 'Projects' | 'Outsourcing' | 'OJT';
  poLayer?: 'PO1' | 'PO2' | 'PO3 - Outsource';
  item: string;
  allocated: number;
  spent: number;
}

// ---------- CSR Management ----------
export interface Agent {
  id: string;
  employeeId: string;
  name: string;
  queue: string;
  vendor: 'Infoline' | 'Green Umbrella' | 'OJT';
  degree: 'Bachelor' | 'Diploma' | 'Non-Diploma';
  nationality: string;
  joinDate: string;
  status: 'Present' | 'Absent' | 'On Leave' | 'Off';
  leaveType?: string;
  /** Not read from the ERP/WFO yet — seeded for the workforce-composition chart on the General Dashboard. */
  gender?: 'Male' | 'Female';
}

export interface WorkforceSnapshot {
  month: string;
  infoline: number;
  greenUmbrella: number;
  ojt: number;
  resignations: number;
}

export interface Interview {
  date: string;
  time: string;
  interviewer: string;
  scores: Record<string, number>;
  notes: string;
  completed: boolean;
}

export type CandidateStatus = 'New' | 'Interview Scheduled' | 'Shortlisted' | 'Rejected' | 'Hired';

export interface Candidate {
  id: string;
  name: string;
  vendor: string;
  department: string;
  appliedDate: string;
  score: number;
  maxScore: number;
  status: CandidateStatus;
  interview?: Interview;
  cv?: string;
}

export interface IdDocument {
  fileName: string;
  status: 'Processing' | 'Extracted' | 'Verified';
  name?: string;
  idNumber?: string;
  expiry?: string;
}

export interface InterviewQuestion {
  id: string;
  category: string;
  text: string;
}

export interface PerformanceRecord {
  agentId: string;
  vendor: string;
  agentName: string;
  queue: string;
  attendancePct: number;
  avgCallResolutionMin: number;
  csatPct: number;
  level: StatusLevel;
}

// ---------- Internal Project Movement ----------
export interface MovementAnnouncement {
  id: string;
  projectName: string;
  targetQueue: string;
  durationMonths: number;
  skillsRequired: string[];
  applicants: number;
  status: 'Open' | 'Closed';
  postedDate: string;
  deadline: string;
}

export interface MovementRequest {
  id: string;
  agentName: string;
  project: string;
  startDate: string;
  endDate: string;
  status: 'Active' | 'Ending Soon' | 'Expired' | 'Pending' | 'Rejected';
  agentId?: string;
  announcementId?: string;
  justification?: string;
  contact?: string;
  previousQueue?: string;
  decisionNote?: string;
}

// ---------- Invoicing & Payments ----------
export interface PayableLine {
  employeeName: string;
  degree: 'Bachelor' | 'Diploma' | 'Non-Diploma';
  basic: number;
  hra: number;
  conveyance: number;
  specialAllowance: number;
  otherAllowance: number;
  gross: number;
  managementFee: number;
  additions: number;
  deductions: number;
  billingRate: number;
}

export interface PaymentRecord {
  id: string;
  vendorName: string;
  /** Which payable lines this payment covers, e.g. "Salary, Overtime" — a vendor invoice can be paid one line, or several, at a time. */
  lines?: string;
  invoiceAmount: number;
  status: 'Pending' | 'Approved' | 'Completed';
  paymentDate?: string;
  slaAtRisk: boolean;
  invoiceRef?: string;
  period?: string;
  contract?: string;
  /** The invoice items (payable lines) this payment covers, and what each is linked to on Payable Line Mapping (Salary, Incentive, ...). */
  items?: Array<{ label: string; linkedTo?: string }>;
  /** Where a Pending payment is waiting (the ERP reports it) — e.g. "Finance approval". */
  pendingAt?: string;
  /** The documents attached on approval: the invoice and payment certificate (mandatory) and up to six others. */
  documents?: Array<{ kind: string; name: string; size: number; url?: string }>;
  /** From the contract, for the completed order. */
  poNumber?: string;
  /** The ERP's own numbers once the payment is completed. */
  receiptNumber?: string;
  requisitionNumber?: string;
  /** The vendor's casual (accounts) email the completion notice and its attachments were sent to. */
  vendorEmail?: string;
  emailSentAt?: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  activityType: string;
  reference: string;
  result: 'Success' | 'Failed';
  details: string;
  erpReference?: string;
  previousValue?: string;
  newValue?: string;
  syncType?: string;
}

// ---------- Cross-cutting ----------
export interface SyncRun {
  id: string;
  type: 'Automated' | 'Manual';
  startedAt: string;
  finishedAt: string;
  initiatedBy: string;
  processed: number;
  created: number;
  updated: number;
  errors?: number;
  contractReference?: string;
  errorMessage?: string;
  status: 'Completed' | 'Failed' | 'No Changes';
}

export interface AppNotification {
  id: string;
  message: string;
  detail: string;
  level: 'amber' | 'red' | 'info' | 'green';
  createdAt: number;
  read: boolean;
  link?: string;
}

export interface NotificationRule {
  id: string;
  contractType: string;
  thresholdDays: number;
  channel: string;
  recipients: string;
  active: boolean;
  templateId?: string;
  language?: string;
  vendor?: string;
  department?: string;
}

export interface PayableRules {
  thresholdSeconds: number;
  deviationPct: number;
  perVendor: boolean;
  /** Whether the 3 Clicks incentive is billed on this invoice (the vendor's real invoice does not include it). */
  includeIncentive: boolean;
}

/** An email to a vendor about the payable lines where their invoice does not match our calculation. */
export interface VendorQuery {
  id: string;
  vendor: string;
  contract: string;
  period: string;
  lines: InvoiceLineDetail[];
  to: string;
  subject: string;
  comment: string;
  sentAt: string;
  sentBy: string;
}

export type InvoiceRunStatus = 'Not started' | 'Validated' | 'Flagged for review' | 'Submitted for approval' | 'Rejected' | 'Approved for payment';

/** One payable line (Salary, Overtime, Performance Incentive, ...) as validated: the system's own figure next to what the vendor is claiming. */
export interface InvoiceLineDetail {
  key: string;
  label: string;
  calculated: number;
  vendorAmount: number;
}

/** A manual Addition or Deduction the vendor adds to the invoice before submitting it (e.g. a sick-leave correction from a previous month), with the reason in free text. */
export interface InvoiceAdjustment {
  type: 'Addition' | 'Deduction';
  amount: number;
  reason: string;
  /** Set when the adjustment was added automatically from a previous-month attendance change. */
  changeId?: string;
}

/** A previous-month attendance record changed after it was reported, with the pay adjustment it caused — kept for reconciliation and audit. */
export interface AttendanceChange {
  id: string;
  agentId: string;
  employeeId: string;
  agentName: string;
  vendor: Agent['vendor'];
  date: string;
  original: string;
  updated: string;
  note: string;
  type: 'Addition' | 'Deduction';
  amount: number;
  reason: string;
  detectedAt: string;
  status: 'Pending' | 'Included in claim';
  /** What was sent to the agent: an SMS and an email, each in English and Arabic. */
  notifications: Array<{ channel: 'SMS' | 'Email'; to: string; text: string }>;
}

/** A validate/approve pass over a chosen subset of a vendor's payable lines — a vendor can be paid one line, or several, at a time. */
export interface InvoiceRun {
  vendor: string;
  period: string;
  lines: InvoiceLineDetail[];
  calculatedTotal: number;
  vendorInvoiceAmount: number;
  variancePct: number;
  status: InvoiceRunStatus;
  paymentId?: string;
  /** What the vendor attached when submitting the line for approval: the invoice, the payment certificate and any other documents. */
  documents?: Array<{ kind: string; name: string; size: number; url?: string }>;
  submittedAt?: string;
  rejectReason?: string;
  /** The vendor's manual adjustments to the invoice, carried by the first line of the submission. */
  adjustments?: InvoiceAdjustment[];
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  /** Which vendor this user represents — set only for role === 'Vendor'. */
  vendorName?: string;
}

// ---------- Vendor claiming portal ----------
export interface ClaimingPeriod {
  startAt: string;
  endAt: string;
  active: boolean;
  /** 'All' or a list of contract references the window applies to. */
  contractRefs: string[] | 'All';
}

export const ATTENDANCE_CODES = ['P', 'OFF', 'A', 'S/L', 'C/L', 'M/L', 'P/L', 'SP', 'ST/L', 'AS'] as const;
export type AttendanceCode = (typeof ATTENDANCE_CODES)[number];

// ---------- Annexure (per-employee billing) ----------
export interface PayrollLine {
  residentId: string;
  basic: number;
  hra: number;
  conveyance: number;
  special: number;
  other: number;
  gross: number;
  managementFee: number;
  additional: number;
  deduction: number;
  billingRate: number;
}

export interface ResignationRecord {
  id: string;
  employeeId: string;
  name: string;
  queue: string;
  residentId: string;
  degree: Agent['degree'];
  vendor: Agent['vendor'];
  joinDate: string;
  resignDate: string;
  gross: number;
  managementFee: number;
  monthlyBilling: number;
  prorated: number;
  absentDays: number;
  leaveEncashment: number;
  total: number;
}

/** Everything the workbook import needs to replace the sample data. */
export interface AnnexureImport {
  fileName: string;
  periodStart: string;
  employees: Array<{ employeeId: string; name: string; queue: string; degree: Agent['degree']; nationality: string; joinDate: string; pay: PayrollLine }>;
  attendance: { days: string[]; rows: Record<string, string[]> };
  resignations: Array<Omit<ResignationRecord, 'id' | 'vendor'>>;
}

// ---------- Contract details (children, attachments, timeline) ----------
export interface ContractRecord {
  id: string;
  parentId: string;
  parentReference: string;
  /** Line reference under the contract, e.g. 2025-013T-00-01/L01. */
  reference: string;
  /** The contract's single PO number; a line shows its own PO number when the ERP gives one. */
  poNumber: string;
  recordType: 'Variation Order' | 'Amendment' | 'Time Extension';
  /** Scope of work of the line. */
  description: string;
  counterparty: string;
  erpReference: string;
  issuedDate: string;
  startDate: string;
  endDate: string;
  /** Not read from the ERP yet for variation order lines, so it is shown as "—". */
  amount?: number;
  currency: 'OMR' | 'USD';
  status: 'Active' | 'Expiring Soon' | 'Closed';
  daysRemaining: number;
  attachments: number;
}

/** One purchase order of a contract as the ERP holds it (SRS 1.8). A contract can have several: its main PO and any other PO numbers on its lines. */
export interface PurchaseOrder {
  poNumber: string;
  main: boolean;
  poType: 'Standard' | 'Outsource';
  category: string;
  /** Not every PO amount is read from the ERP yet; those show as "—". */
  amount?: number;
  currency: 'OMR' | 'USD';
  poDate: string;
  startDate: string;
  endDate: string;
  status: 'Active' | 'Expiring Soon' | 'Expired' | 'Cancelled' | 'Closed';
  parentReference: string;
  erpReference: string;
  documents: number;
  records: ContractRecord[];
}

export interface ContractAttachment {
  id: string;
  name: string;
  type: string;
  linkedTo: string;
  erpAttachmentId: string;
  erpDocumentRef: string;
  sizeKb: number;
  category: string;
  version: string;
  source: string;
  uploadedBy: string;
  uploadedAt: string;
  syncedAt: string;
}

export interface ContractTimelineEvent {
  id: string;
  at: string;
  kind: 'created' | 'attachments' | 'linked' | 'notice' | 'alert' | 'escalation' | 'sync' | 'renewal';
  title: string;
  details: string;
  actor: string;
  channel?: string;
  recipients?: string;
  ruleLabel?: string;
  result: 'Success' | 'Failed';
}
