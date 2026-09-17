import { StatusLevel } from './status';

// ---------- Contracts & Budget ----------
export interface Contract {
  id: string;
  reference: string;
  name: string;
  recordType: 'Parent Contract' | 'Subcontract' | 'Purchase Order' | 'Amendment' | 'Time Extension';
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
}

export interface WorkforceSnapshot {
  month: string;
  infoline: number;
  greenUmbrella: number;
  ojt: number;
  resignations: number;
}

export interface Candidate {
  id: string;
  name: string;
  vendor: string;
  department: string;
  appliedDate: string;
  score: number;
  maxScore: number;
  status: 'Shortlisted' | 'Rejected' | 'Hired';
}

export interface PerformanceRecord {
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
  invoiceAmount: number;
  status: 'Pending' | 'Approved' | 'Completed';
  paymentDate?: string;
  slaAtRisk: boolean;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  activityType: string;
  reference: string;
  result: 'Success' | 'Failed';
  details: string;
}
