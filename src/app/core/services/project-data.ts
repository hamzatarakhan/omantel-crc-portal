/**
 * Project budget requests (SRS "Project Budget Preparation"). Line managers and project managers submit projects for the next
 * financial year with the budget needed, a justification, a priority and the head count they need; the Budget Owner includes,
 * returns or excludes each one. The seed is the supplier/project list from Omantel's current sheet plus three projects from the
 * previous financial year (read-only history that can be copied forward).
 */
export type SubmissionStatus = 'Draft' | 'Submitted' | 'Returned for Modification' | 'Included in Budget' | 'Excluded from Budget' | 'Cancelled';
export const SUBMISSION_STATUSES: SubmissionStatus[] = ['Draft', 'Submitted', 'Returned for Modification', 'Included in Budget', 'Excluded from Budget', 'Cancelled'];

export type ProjectStatus = 'Need Renewal' | 'Need Cancellation' | 'New Proposed Project' | 'Need Extension';
export const PROJECT_STATUSES: ProjectStatus[] = ['Need Renewal', 'Need Cancellation', 'New Proposed Project', 'Need Extension'];
export const PRIORITIES = ['High', 'Medium', 'Low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface ProjectEvent {
  at: string;
  by: string;
  role: string;
  action: 'Created' | 'Edited' | 'Submitted' | 'Included' | 'Returned' | 'Excluded' | 'Cancelled' | 'Resubmitted' | 'Copied';
  note: string;
}

export interface ProjectRequest {
  id: string;
  financialYear: string;
  name: string;
  reference?: string;
  projectStatus: ProjectStatus;
  scope: string;
  contractRef?: string;
  poNumber?: string;
  from?: string;
  to?: string;
  /** Estimated project cost, OMR. */
  budget: number;
  /** Justification: why the project is needed. */
  reason: string;
  priority: Priority;
  projectManager: string;
  lineManager: string;
  /** Head count the project needs, with the role, cost per resource and months. */
  headCount: number;
  resourceRole?: string;
  costPerResource?: number;
  months?: number;
  comments?: string;
  attachments: string[];
  requestedBy: string;
  status: SubmissionStatus;
  decisionNote?: string;
  decidedBy?: string;
  decidedAt?: string;
  copiedFrom?: string;
  submittedAt?: string;
  updatedAt: string;
  history: ProjectEvent[];
}

/** Head count × cost per resource × months. */
export const resourceCost = (p: Pick<ProjectRequest, 'headCount' | 'costPerResource' | 'months'>) => Math.round((p.headCount || 0) * (p.costPerResource || 0) * (p.months || 0));
export const projectTotal = (p: ProjectRequest) => p.budget + resourceCost(p);

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString();
const ev = (offset: number, by: string, role: string, action: ProjectEvent['action'], note: string): ProjectEvent => ({ at: day(offset), by, role, action, note });

const TL = 'Khalid Al-Farsi';
const PM = 'Noor Al-Rawahi';
const OWNER = 'Mariam Al-Kindi';
export const CURRENT_FY = 'FY2027';
export const PREVIOUS_FY = 'FY2026';

function seed(id: string, name: string, projectStatus: ProjectStatus, scope: string, budget: number, reason: string, status: SubmissionStatus, priority: Priority, extra: Partial<ProjectRequest> = {}, note = ''): ProjectRequest {
  const decided = status === 'Included in Budget' || status === 'Returned for Modification' || status === 'Excluded from Budget';
  const history: ProjectEvent[] = [ev(-40, TL, 'Team Lead', 'Created', 'Project added.')];
  if (status !== 'Draft') history.push(ev(-35, TL, 'Team Lead', 'Submitted', 'Sent for a decision.'));
  if (status === 'Included in Budget') history.push(ev(-30, OWNER, 'Budget Owner', 'Included', note || 'Included in the coming budget.'));
  if (status === 'Returned for Modification') history.push(ev(-6, OWNER, 'Budget Owner', 'Returned', note));
  if (status === 'Excluded from Budget') history.push(ev(-28, OWNER, 'Budget Owner', 'Excluded', note || 'Not included this year.'));
  return {
    id, financialYear: CURRENT_FY, name, projectStatus, scope, budget, reason, priority, projectManager: PM, lineManager: TL, headCount: 0, attachments: [], requestedBy: TL, status,
    updatedAt: history[history.length - 1].at, history, submittedAt: status !== 'Draft' ? day(-35) : undefined,
    decisionNote: decided ? note || undefined : undefined, decidedBy: decided ? OWNER : undefined, decidedAt: decided ? history[history.length - 1].at : undefined,
    ...extra,
  };
}

export const SEED_PROJECTS: ProjectRequest[] = [
  seed('PRJ-1', 'VAS Tool Project', 'Need Extension', 'UNIFIED CUSTOMER CARE VAS TOOL Dec 2023', 6000, 'Unifies the value-added-service screens agents use, so handling time drops.', 'Included in Budget', 'Medium', { contractRef: '2021-167-T-00', poNumber: '321101273', from: '2021-09-01', to: '2022-09-01' }),
  seed('PRJ-2', 'Purchasing CSR Headsets for Contact Center 2023 H1', 'New Proposed Project', 'Depends on the requirement during the year', 6500, 'Headsets are worn out on two queues and replacements are needed before the summer peak.', 'Submitted', 'Medium'),
  seed('PRJ-3', 'Contact Center knowledge base (KB) sprint 5', 'Need Renewal', 'Contact Center knowledge base (KB) sprint 5 (remaining is 5590)', 5590, 'Finishes the last sprint of the knowledge base so agents stop searching across separate documents.', 'Included in Budget', 'High', { poNumber: '322101308' }),
  seed('PRJ-4', 'Innovative Business Communication (IVR)', 'Need Extension', 'IVR Record', 2400, 'Records IVR calls for quality review.', 'Included in Budget', 'Low', { poNumber: '322100709' }),
  seed('PRJ-5', 'Omantel Tele-Sales Vocalcom Solution (July 2024 till July 2025)', 'Need Renewal', 'Omantel Tele-Sales Vocalcom Solution (July 2024 till July 2025)', 8000, 'Runs the outbound tele-sales dialler for the year.', 'Included in Budget', 'High', { contractRef: '2024 171 T 00 11 25 O', from: '2024-07-01', to: '2025-07-31' }),
  seed('PRJ-6', 'Blacklisting', 'New Proposed Project', 'Blacklisting is a new System integrate all defaulters in Oman', 30000, 'A new system that integrates all defaulters in Oman, so risky customers are flagged at the first call.', 'Submitted', 'High', { headCount: 2, resourceRole: 'Analyst', costPerResource: 600, months: 6 }),
  seed('PRJ-7', 'Basket, Inc. - Inv. 005/2-0-24', 'Need Renewal', 'Speech Analytics for contact Centre-Call Quality', 4500, 'Speech analytics to measure call quality without manual sampling.', 'Included in Budget', 'Medium', { contractRef: '2023-215-T-00-', poNumber: '323102380' }),
  seed('PRJ-8', 'Futurelook "Virtual agent IVR"', 'New Proposed Project', 'Futurelook "Virtual agent IVR"', 12000, 'A virtual agent in the IVR to answer simple requests without an agent.', 'Returned for Modification', 'Low', {}, 'Please add the expected go-live date and how the licence cost is split before we can decide.'),
  seed('PRJ-9', 'Sohar contact center refreshment', 'New Proposed Project', 'Sohar contact center refreshment', 55000, 'Refreshes the Sohar contact centre; the contract is still under RFT.', 'Draft', 'Medium', { contractRef: 'Still under RFT' }),
  // previous financial year — read-only history that can be copied forward
  seed('PRJ-P1', 'CRC Platform rollout', 'New Proposed Project', 'Roll out the CRC platform for Customer Care.', 15000, 'Replaces the spreadsheets used to track contracts and budgets.', 'Included in Budget', 'High', { financialYear: PREVIOUS_FY, projectManager: PM, headCount: 1, resourceRole: 'Business analyst', costPerResource: 0, months: 0 }),
  seed('PRJ-P2', 'Agent wallboards', 'New Proposed Project', 'Wallboards showing queue status on the floor.', 4000, 'Real-time visibility of waiting calls.', 'Excluded from Budget', 'Low', { financialYear: PREVIOUS_FY }, 'Deferred — not a priority this year.'),
  seed('PRJ-P3', 'Knowledge base sprint 4', 'Need Renewal', 'Fourth sprint of the contact centre knowledge base.', 5200, 'Continues the knowledge base build.', 'Excluded from Budget', 'Medium', { financialYear: PREVIOUS_FY }, 'Merged into sprint 5.'),
];
