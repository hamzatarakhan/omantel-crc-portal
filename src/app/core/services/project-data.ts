/**
 * Project requests: Team Leads / Line Managers propose projects with the budget they need and why; the Budget Owner keeps,
 * removes or sends them back. The seed below is the supplier/project list from Omantel's current sheet, with the columns the
 * sheet has (contract, PO, scope of work, from, to) — contract, PO and dates are optional because the sheet leaves them blank.
 */
export type ProjectStatus = 'Draft' | 'Submitted' | 'Kept' | 'Sent back' | 'Removed';
export const PROJECT_STATUSES: ProjectStatus[] = ['Draft', 'Submitted', 'Kept', 'Sent back', 'Removed'];

export interface ProjectEvent {
  at: string;
  by: string;
  role: string;
  action: 'Created' | 'Edited' | 'Submitted' | 'Kept' | 'Sent back' | 'Removed' | 'Resubmitted';
  note: string;
}

export interface ProjectRequest {
  id: string;
  name: string;
  scope: string;
  contractRef?: string;
  poNumber?: string;
  from?: string;
  to?: string;
  /** Budget the requester needs, OMR. */
  budget: number;
  /** Why the project is needed. */
  reason: string;
  requestedBy: string;
  status: ProjectStatus;
  decisionNote?: string;
  decidedBy?: string;
  decidedAt?: string;
  updatedAt: string;
  history: ProjectEvent[];
}

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString();
const ev = (offset: number, by: string, role: string, action: ProjectEvent['action'], note: string): ProjectEvent => ({ at: day(offset), by, role, action, note });

const TL = 'Khalid Al-Farsi';
const OWNER = 'Mariam Al-Kindi';

function seed(id: string, name: string, scope: string, budget: number, reason: string, status: ProjectStatus, extra: Partial<ProjectRequest> = {}, note = ''): ProjectRequest {
  const history: ProjectEvent[] = [ev(-40, TL, 'Team Lead', 'Created', 'Project added.')];
  if (status !== 'Draft') history.push(ev(-35, TL, 'Team Lead', 'Submitted', 'Sent for a decision.'));
  if (status === 'Kept') history.push(ev(-30, OWNER, 'Budget Owner', 'Kept', note || 'Approved for the coming budget.'));
  if (status === 'Sent back') history.push(ev(-6, OWNER, 'Budget Owner', 'Sent back', note));
  return {
    id, name, scope, budget, reason, requestedBy: TL, status, updatedAt: history[history.length - 1].at, history,
    decisionNote: status === 'Kept' || status === 'Sent back' ? note || undefined : undefined,
    decidedBy: status === 'Kept' || status === 'Sent back' ? OWNER : undefined,
    decidedAt: status === 'Kept' || status === 'Sent back' ? history[history.length - 1].at : undefined,
    ...extra,
  };
}

export const SEED_PROJECTS: ProjectRequest[] = [
  seed('PRJ-1', 'VAS Tool Project', 'UNIFIED CUSTOMER CARE VAS TOOL Dec 2023', 6000, 'Unifies the value-added-service screens agents use, so handling time drops.', 'Kept', { contractRef: '2021-167-T-00', poNumber: '321101273', from: '2021-09-01', to: '2022-09-01' }),
  seed('PRJ-2', 'Purchasing CSR Headsets for Contact Center 2023 H1', 'Depends on the requirement during the year', 6500, 'Headsets are worn out on two queues and replacements are needed before the summer peak.', 'Submitted'),
  seed('PRJ-3', 'Contact Center knowledge base (KB) sprint 5', 'Contact Center knowledge base (KB) sprint 5 (remaining is 5590)', 5590, 'Finishes the last sprint of the knowledge base so agents stop searching across separate documents.', 'Kept', { poNumber: '322101308' }),
  seed('PRJ-4', 'Innovative Business Communication (IVR)', 'IVR Record', 2400, 'Records IVR calls for quality review.', 'Kept', { poNumber: '322100709' }),
  seed('PRJ-5', 'Omantel Tele-Sales Vocalcom Solution (July 2024 till July 2025)', 'Omantel Tele-Sales Vocalcom Solution (July 2024 till July 2025)', 8000, 'Runs the outbound tele-sales dialler for the year.', 'Kept', { contractRef: '2024 171 T 00 11 25 O', from: '2024-07-01', to: '2025-07-31' }),
  seed('PRJ-6', 'Blacklisting', 'Blacklisting is a new System integrate all defaulters in Oman', 30000, 'A new system that integrates all defaulters in Oman, so risky customers are flagged at the first call.', 'Submitted'),
  seed('PRJ-7', 'Basket, Inc. - Inv. 005/2-0-24', 'Speech Analytics for contact Centre-Call Quality', 4500, 'Speech analytics to measure call quality without manual sampling.', 'Kept', { contractRef: '2023-215-T-00-', poNumber: '323102380' }),
  seed('PRJ-8', 'Futurelook "Virtual agent IVR"', 'Futurelook "Virtual agent IVR"', 12000, 'A virtual agent in the IVR to answer simple requests without an agent.', 'Sent back', {}, 'Please add the expected go-live date and how the licence cost is split before we can decide.'),
  seed('PRJ-9', 'Sohar contact center refreshment', 'Sohar contact center refreshment', 55000, 'Refreshes the Sohar contact centre; the contract is still under RFT.', 'Draft', { contractRef: 'Still under RFT' }),
];
