import { Injectable } from '@angular/core';
import {
  Agent,
  AuditEntry,
  BudgetLine,
  Candidate,
  Contract,
  MovementAnnouncement,
  MovementRequest,
  PayableLine,
  PaymentRecord,
  PerformanceRecord,
  WorkforceSnapshot,
} from '../models/domain';
import { daysRemainingToLevel } from '../models/status';

/**
 * Synthetic demo data only. Queue names and billing structure mirror the real
 * Infoline/Omantel monthly operation described in the requirements doc; agent
 * names, ids, and figures below are generated, not sourced from real records.
 */

const QUEUES = [
  'Sales', 'Retention', 'Complaints', 'Debt Recovery', 'Billing Complaints',
  'Payment Channels Support', 'Corporate Telesales', 'Agent Experience',
  'RTM', 'Hotline', 'Project', 'TRA Complaint',
];

const FIRST_NAMES = ['Ahmed', 'Fatima', 'Salim', 'Mariam', 'Yousuf', 'Aisha', 'Khalid', 'Noor', 'Talal', 'Layla', 'Hamed', 'Zainab', 'Rashid', 'Huda', 'Waleed', 'Sara'];
const LAST_NAMES = ['Al-Balushi', 'Al-Habsi', 'Al-Rawahi', 'Al-Siyabi', 'Al-Harthi', 'Al-Maskari', 'Al-Kindi', 'Al-Farsi', 'Al-Amri', 'Al-Zadjali'];

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function name(rand: () => number): string {
  return `${FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)]}`;
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

@Injectable({ providedIn: 'root' })
export class MockDataService {
  private rand = seededRandom(42);

  readonly queues = QUEUES;

  getContracts(): Contract[] {
    const vendors = ['Infoline LLC', 'Green Umbrella Services', 'Al-Waha Facilities', 'Tech Bridge Solutions', 'Reliance Outsourcing'];
    const types = ['Manpower Outsourcing', 'Facilities Management', 'IT Support', 'Training Services', 'Recruitment Services'];
    const offsets = [-10, 4, 12, 28, 45, 120, 200, -30, 60, 8];
    return offsets.map((offset, i) => {
      const daysRemaining = offset;
      const level = daysRemainingToLevel(daysRemaining);
      return {
        id: `CT-${1000 + i}`,
        reference: `2025-013T-00-${(i + 1).toString().padStart(2, '0')}`,
        name: `${types[i % types.length]} Agreement ${2025 + (i % 2)}`,
        recordType: i % 4 === 0 ? 'Parent Contract' : 'Subcontract',
        parentReference: i % 4 === 0 ? undefined : `2025-013T-00-${((i % 4) + 1).toString().padStart(2, '0')}`,
        contractType: types[i % types.length],
        vendorName: vendors[i % vendors.length],
        startDate: '2025-01-01',
        endDate: addDays(daysRemaining),
        amount: 45000 + i * 8200,
        currency: 'OMR',
        status: daysRemaining < 0 ? 'Expired' : level === 'normal' ? 'Active' : 'Expiring Soon',
        renewalStatus: i % 3 === 0 ? 'Renewal in progress' : undefined,
        erpReference: `ERP-VEN-${5000 + i}`,
        lastSyncedAt: new Date().toISOString(),
        daysRemaining,
      };
    });
  }

  getBudgetLines(): BudgetLine[] {
    return [
      { id: 'b1', category: 'Outsourcing', poLayer: 'PO1', item: 'Bachelor-tier manpower', allocated: 26000, spent: 19800 },
      { id: 'b2', category: 'Outsourcing', poLayer: 'PO2', item: 'Diploma-tier manpower', allocated: 39500, spent: 30800 },
      { id: 'b3', category: 'Outsourcing', poLayer: 'PO3 - Outsource', item: 'Non-Diploma-tier manpower', allocated: 38800, spent: 30200 },
      { id: 'b4', category: 'Outsourcing', poLayer: 'PO3 - Outsource', item: 'Incentive', allocated: 6000, spent: 3900 },
      { id: 'b5', category: 'Outsourcing', poLayer: 'PO3 - Outsource', item: 'Overtime', allocated: 4200, spent: 2900 },
      { id: 'b6', category: 'OJT', item: 'On-the-Job Training', allocated: 9000, spent: 6200 },
      { id: 'b7', category: 'Petty Cash', item: 'Customer Care petty cash', allocated: 3000, spent: 2870 },
      { id: 'b8', category: 'Projects', item: 'CRC Platform rollout', allocated: 15000, spent: 4100 },
      { id: 'b9', category: 'Total Budget', item: 'Customer Care annual budget', allocated: 141500, spent: 122965 },
    ];
  }

  getAgents(count = 40): Agent[] {
    const statuses: Agent['status'][] = ['Present', 'Present', 'Present', 'Present', 'On Leave', 'Off', 'Absent'];
    const leaveTypes = ['Sick Leave', 'Annual Leave', 'Study Leave', 'Maternity Leave'];
    const degrees: Agent['degree'][] = ['Bachelor', 'Diploma', 'Non-Diploma'];
    const vendors: Agent['vendor'][] = ['Infoline', 'Green Umbrella', 'OJT'];
    return Array.from({ length: count }, (_, i) => {
      const status = statuses[Math.floor(this.rand() * statuses.length)];
      return {
        id: `AG-${2000 + i}`,
        employeeId: `${3000 + i}`,
        name: name(this.rand),
        queue: QUEUES[Math.floor(this.rand() * QUEUES.length)],
        vendor: vendors[Math.floor(this.rand() * vendors.length)],
        degree: degrees[Math.floor(this.rand() * degrees.length)],
        nationality: 'Oman',
        joinDate: `20${18 + Math.floor(this.rand() * 7)}-0${1 + Math.floor(this.rand() * 8)}-1${Math.floor(this.rand() * 9)}`,
        status,
        leaveType: status === 'On Leave' ? leaveTypes[Math.floor(this.rand() * leaveTypes.length)] : undefined,
      };
    });
  }

  getWorkforceSnapshots(): WorkforceSnapshot[] {
    const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
    return months.map((month, i) => ({
      month,
      infoline: 150 + i * 3,
      greenUmbrella: 22 + (i % 3),
      ojt: 8 + (i % 4),
      resignations: 2 + (i % 3),
    }));
  }

  getCandidates(): Candidate[] {
    const statuses: Candidate['status'][] = ['Shortlisted', 'Rejected', 'Hired', 'Shortlisted', 'Hired'];
    return Array.from({ length: 12 }, (_, i) => ({
      id: `CAND-${i + 1}`,
      name: name(this.rand),
      vendor: ['Infoline LLC', 'Green Umbrella Services'][i % 2],
      department: QUEUES[i % QUEUES.length],
      appliedDate: addDays(-Math.floor(this.rand() * 60)),
      score: 60 + Math.floor(this.rand() * 40),
      maxScore: 100,
      status: statuses[i % statuses.length],
    }));
  }

  getPerformanceRecords(): PerformanceRecord[] {
    return this.getAgents(18).map((a) => {
      const attendancePct = 80 + Math.floor(this.rand() * 20);
      const csatPct = 70 + Math.floor(this.rand() * 30);
      const score = (attendancePct + csatPct) / 2;
      return {
        agentId: a.id,
        vendor: a.vendor,
        agentName: a.name,
        queue: a.queue,
        attendancePct,
        avgCallResolutionMin: 3 + Math.round(this.rand() * 6 * 10) / 10,
        csatPct,
        level: score >= 90 ? 'normal' : score >= 80 ? 'amber' : score >= 70 ? 'orange' : 'red',
      };
    });
  }

  getMovementAnnouncements(): MovementAnnouncement[] {
    return [
      { id: 'MV-1', projectName: 'Retention Growth Squad', targetQueue: 'Retention', durationMonths: 6, skillsRequired: ['Upselling', 'Objection Handling'], applicants: 9, status: 'Open', postedDate: addDays(-10), deadline: addDays(5) },
      { id: 'MV-2', projectName: 'Digital Channels Pilot', targetQueue: 'Payment Channels Support', durationMonths: 3, skillsRequired: ['App Troubleshooting'], applicants: 4, status: 'Open', postedDate: addDays(-4), deadline: addDays(12) },
      { id: 'MV-3', projectName: 'Corporate Telesales Surge', targetQueue: 'Corporate Telesales', durationMonths: 4, skillsRequired: ['B2B Sales'], applicants: 14, status: 'Closed', postedDate: addDays(-45), deadline: addDays(-15) },
    ];
  }

  getMovementRequests(): MovementRequest[] {
    const statuses: MovementRequest['status'][] = ['Active', 'Ending Soon', 'Expired', 'Pending', 'Rejected'];
    return Array.from({ length: 10 }, (_, i) => ({
      id: `MR-${i + 1}`,
      agentName: name(this.rand),
      project: this.getMovementAnnouncements()[i % 3].projectName,
      startDate: addDays(-30 - i * 5),
      endDate: addDays(30 - i * 8),
      status: statuses[i % statuses.length],
    }));
  }

  getPayableLines(): PayableLine[] {
    // Structure mirrors the real Infoline monthly billing-rate build-up (Basic + HRA + Conveyance + Allowances + Mgmt Fee = Billing Rate)
    const rows: Array<[string, PayableLine['degree'], number, number, number, number]> = [
      ['Bachelor tier', 'Bachelor', 302.38, 75, 40, 96.3],
      ['Diploma tier', 'Diploma', 253.24, 70, 40, 115],
      ['Non-Diploma tier', 'Non-Diploma', 293.58, 75, 40, 73],
    ];
    return rows.map(([label, degree, basic, hra, conveyance, special]) => {
      const gross = basic + hra + conveyance + special;
      const managementFee = 116;
      const additions = degree === 'Bachelor' ? 0 : 25;
      const deductions = degree === 'Non-Diploma' ? 12 : 0;
      return {
        employeeName: label,
        degree,
        basic,
        hra,
        conveyance,
        specialAllowance: special,
        otherAllowance: 0,
        gross,
        managementFee,
        additions,
        deductions,
        billingRate: gross + managementFee + additions - deductions,
      };
    });
  }

  getPaymentRecords(): PaymentRecord[] {
    const statuses: PaymentRecord['status'][] = ['Pending', 'Approved', 'Completed'];
    const vendors = ['Infoline LLC', 'Green Umbrella Services', 'Al-Waha Facilities', 'Tech Bridge Solutions'];
    return vendors.map((v, i) => ({
      id: `PAY-${i + 1}`,
      vendorName: v,
      invoiceAmount: 78000 + i * 5400,
      status: statuses[i % statuses.length],
      paymentDate: i % 3 === 2 ? addDays(-2) : undefined,
      slaAtRisk: i === 1,
    }));
  }

  getAuditLog(): AuditEntry[] {
    return Array.from({ length: 10 }, (_, i) => ({
      id: `AUD-${i + 1}`,
      timestamp: new Date(Date.now() - i * 3600_000).toISOString(),
      actor: i % 3 === 0 ? 'System (Scheduled Sync)' : name(this.rand),
      activityType: ['Contract Sync', 'Escalation Sent', 'Budget Approved', 'Movement Approved', 'Payment Validated'][i % 5],
      reference: `REF-${9000 + i}`,
      result: i % 7 === 6 ? 'Failed' : 'Success',
      details: 'Synchronized 42 records, 3 updated, 0 errors.',
    }));
  }
}
