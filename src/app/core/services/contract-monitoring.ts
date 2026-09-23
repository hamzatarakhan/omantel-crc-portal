import { Contract, ContractRecord } from '../models/domain';
import { StatusLevel, daysRemainingToLevel } from '../models/status';
import { addDays, childRecordsFor } from './contract-data';

/** Pure types and rules behind the SRS "monitoring" features: actions, escalation, sync, templates, data quality. */

// ---------- Monitoring actions (SRS 1.18) ----------
export const ACTION_TYPES = [
  'Review contract', 'Initiate renewal in ERP', 'Request extension in ERP', 'Request amendment in ERP', 'Follow up on pending PO',
  'Upload or update information in ERP', 'Assign follow-up responsibility', 'Escalate contract',
] as const;
export type ActionStatus = 'Open' | 'In progress' | 'Completed' | 'Closed';
export const ACTION_STATUSES: ActionStatus[] = ['Open', 'In progress', 'Completed', 'Closed'];

export interface MonitoringAction {
  id: string;
  contractId: string;
  contractReference: string;
  type: string;
  owner: string;
  dueDate: string;
  status: ActionStatus;
  comments: string;
  erpTransactionRef: string;
  completedDate?: string;
  createdBy: string;
  createdAt: string;
  lastUpdatedBy: string;
  updatedAt: string;
}

// ---------- Escalation (SRS 1.17) ----------
export type EscalationStatus = 'Not required' | 'Pending action' | 'Action in progress' | 'Escalated' | 'Resolved' | 'Closed';
export const ESCALATION_STATUSES: EscalationStatus[] = ['Not required', 'Pending action', 'Action in progress', 'Escalated', 'Resolved', 'Closed'];

export interface EscalationEvent {
  at: string;
  status: EscalationStatus;
  reason: string;
  recipients: string;
  resolutionDate?: string;
  comments: string;
  responsibleUser?: string;
  supportingRef?: string;
  erpUpdateRef?: string;
  by: string;
}

export interface EscalationRule {
  hours: number;
  /** Contract types the rule applies to; empty = all contracts. */
  appliesTo: string[];
  recipients: string;
}

export function escalationApplies(c: Contract, rule: EscalationRule): boolean {
  return rule.appliesTo.length === 0 || rule.appliesTo.includes(c.contractType);
}

/** The escalation status CRC works out on its own from the contract's dates and renewal state. */
export function baseEscalationStatus(c: Contract, rule: EscalationRule): EscalationStatus {
  if (c.status === 'Cancelled') return 'Closed';
  if (c.renewalStatus === 'Renewed') return 'Resolved';
  if (!escalationApplies(c, rule)) return 'Not required';
  if (c.daysRemaining <= rule.hours / 24) return 'Escalated';
  if (c.daysRemaining <= 30) return 'Pending action';
  return 'Not required';
}

// ---------- Synchronization (SRS 1.9 – 1.12) ----------
export type SyncFrequency = 'Every 6 hours' | 'Twice daily' | 'Daily' | 'Weekly';
export const SYNC_FREQUENCIES: SyncFrequency[] = ['Every 6 hours', 'Twice daily', 'Daily', 'Weekly'];

export interface SyncConfig {
  enabled: boolean;
  frequency: SyncFrequency;
  /** Organisation time zone wall-clock start time, HH:mm. */
  time: string;
  timezone: string;
  timeoutSec: number;
}

export const ORG_TZ_OFFSET_HOURS = 4;

/** Next scheduled run in the organisation time zone (Asia/Muscat, GMT+4, no daylight saving). Weekly runs start on Sunday. */
export function nextRunAt(cfg: SyncConfig, now = new Date()): Date {
  const [hh, mm] = cfg.time.split(':').map(Number);
  const offset = ORG_TZ_OFFSET_HOURS * 3600000;
  const local = new Date(now.getTime() + offset);
  const base = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hh || 0, mm || 0);
  const day = 86400000;
  const step = cfg.frequency === 'Every 6 hours' ? 6 * 3600000 : cfg.frequency === 'Twice daily' ? 12 * 3600000 : cfg.frequency === 'Weekly' ? 7 * day : day;
  let t = cfg.frequency === 'Weekly' ? base - new Date(base).getUTCDay() * day : base - day;
  while (t <= local.getTime()) t += step;
  return new Date(t - offset);
}

export type SyncErrorCategory = 'Connectivity' | 'Timeout' | 'Authentication' | 'Data quality' | 'Mapping';
export interface SyncError {
  id: string;
  runId?: string;
  syncType: 'Automated' | 'Manual';
  at: string;
  contractReference: string;
  erpReference: string;
  initiatedBy: string;
  message: string;
  category: SyncErrorCategory;
  processing: 'Failed – last valid data retained' | 'Record rejected';
  resolution: 'Open' | 'Resolved' | 'Retried successfully';
  resolutionNote?: string;
  resolvedAt?: string;
}

export interface ContractChange {
  id: string;
  contractId: string;
  contractReference: string;
  at: string;
  field: string;
  previous: string;
  next: string;
  source: 'Automated sync' | 'Manual sync';
}

export interface SyncState {
  status: 'Success' | 'No changes' | 'Failed';
  at: string;
  by: string;
  type: 'Automated' | 'Manual';
  message?: string;
}

/** Field changes that arrived from the ERP earlier (amendment revaluations, cancellation, renewal) — the history kept by FR-CT-005. */
export function seedChanges(contracts: Contract[]): ContractChange[] {
  const out: ContractChange[] = [];
  const now = Date.now();
  const push = (c: Contract, at: string, field: string, previous: string, next: string) => {
    if (new Date(at + 'Z').getTime() <= now) out.push({ id: `CHG-${c.id}-${out.length + 1}`, contractId: c.id, contractReference: c.reference, at, field, previous, next, source: 'Automated sync' });
  };
  for (const c of contracts) {
    const kids = childRecordsFor(c);
    const am = kids.find((k) => k.recordType === 'Amendment');
    if (am && c.status !== 'Cancelled') push(c, `${am.issuedDate}T02:06:00`, 'Contract amount (OMR)', String(c.amount - (am.amount ?? 0)), String(c.amount));
    if (c.status === 'Cancelled') {
      push(c, `${addDays(c.endDate, -20)}T02:00:00`, 'Contract status', 'Active', 'Cancelled');
      push(c, `${addDays(c.endDate, -20)}T02:00:00`, 'ERP status', 'Open', 'Cancelled');
    }
    if (c.renewalStatus === 'Renewed') {
      push(c, `${addDays(c.erpModifiedAt ?? c.startDate, -1)}T02:02:00`, 'Contract end date', addDays(c.endDate, -365), c.endDate);
      push(c, `${addDays(c.erpModifiedAt ?? c.startDate, -1)}T02:02:00`, 'Renewal status', 'Renewal in progress', 'Renewed');
    }
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}

// ---------- Notification templates (SRS 1.16.5) ----------
export interface NotificationTemplate {
  id: string;
  name: string;
  purpose: 'Expiry alert' | 'Escalation';
  language: 'English' | 'Arabic';
  emailSubject: string;
  emailBody: string;
  sms: string;
  inApp: string;
}

export const PLACEHOLDERS = [
  '{{contractReference}}', '{{contractName}}', '{{vendorName}}', '{{endDate}}', '{{daysRemaining}}', '{{amount}}', '{{parentContract}}', '{{poNumber}}', '{{contractLink}}',
];

export function renderTemplate(text: string, c: Contract): string {
  const values: Record<string, string> = {
    contractReference: c.reference, contractName: c.name, vendorName: c.vendorName, endDate: c.endDate, daysRemaining: String(c.daysRemaining),
    amount: `${c.amount.toLocaleString('en-GB')} ${c.currency}`, parentContract: c.parentReference ?? c.reference, poNumber: c.poNumber ?? '—',
    contractLink: `https://tawasul.omantel.om/crc/contracts-budget/contracts/${c.id}`,
  };
  return text.replace(/\{\{(\w+)\}\}/g, (m, k) => values[k] ?? m);
}

export const SEED_TEMPLATES: NotificationTemplate[] = [
  {
    id: 'T1', name: 'Contract expiry alert', purpose: 'Expiry alert', language: 'English',
    emailSubject: 'Contract {{contractReference}} expires in {{daysRemaining}} days',
    emailBody: 'Dear team,\n\nContract {{contractReference}} — {{contractName}} with {{vendorName}} ({{amount}}) ends on {{endDate}}, {{daysRemaining}} days from today.\nPlease review it and start the renewal or extension in the ERP.\n\nOpen the contract: {{contractLink}}',
    sms: 'CRC: {{contractReference}} ({{vendorName}}) expires on {{endDate}} ({{daysRemaining}} days). {{contractLink}}',
    inApp: '{{contractReference}} expires in {{daysRemaining}} days — review and renew in the ERP.',
  },
  {
    id: 'T2', name: 'تنبيه انتهاء العقد', purpose: 'Expiry alert', language: 'Arabic',
    emailSubject: 'ينتهي العقد {{contractReference}} خلال {{daysRemaining}} يومًا',
    emailBody: 'فريق العمل الكريم،\n\nينتهي العقد {{contractReference}} — {{contractName}} مع {{vendorName}} بتاريخ {{endDate}} أي بعد {{daysRemaining}} يومًا.\nيرجى مراجعته وبدء إجراءات التجديد أو التمديد في نظام الموارد.\n\nفتح العقد: {{contractLink}}',
    sms: 'CRC: العقد {{contractReference}} ({{vendorName}}) ينتهي في {{endDate}} ({{daysRemaining}} يومًا). {{contractLink}}',
    inApp: 'ينتهي العقد {{contractReference}} خلال {{daysRemaining}} يومًا — يرجى المراجعة والتجديد.',
  },
  {
    id: 'T3', name: 'Escalation — unresolved contract', purpose: 'Escalation', language: 'English',
    emailSubject: 'ESCALATION: {{contractReference}} is unresolved and expires on {{endDate}}',
    emailBody: 'Dear management,\n\nContract {{contractReference}} — {{contractName}} with {{vendorName}} ({{amount}}) has not been renewed or closed and ends on {{endDate}}.\nImmediate action is required.\n\nOpen the contract: {{contractLink}}',
    sms: 'ESCALATION: {{contractReference}} ({{vendorName}}) unresolved, ends {{endDate}}. {{contractLink}}',
    inApp: 'Escalation: {{contractReference}} is unresolved and ends on {{endDate}}.',
  },
  {
    id: 'T4', name: 'تصعيد — عقد غير محسوم', purpose: 'Escalation', language: 'Arabic',
    emailSubject: 'تصعيد: العقد {{contractReference}} غير محسوم وينتهي في {{endDate}}',
    emailBody: 'الإدارة الكريمة،\n\nلم يتم تجديد العقد {{contractReference}} — {{contractName}} مع {{vendorName}} أو إغلاقه، وينتهي في {{endDate}}.\nيلزم اتخاذ إجراء فوري.\n\nفتح العقد: {{contractLink}}',
    sms: 'تصعيد: العقد {{contractReference}} ({{vendorName}}) غير محسوم وينتهي {{endDate}}. {{contractLink}}',
    inApp: 'تصعيد: العقد {{contractReference}} غير محسوم وينتهي في {{endDate}}.',
  },
];

// ---------- Business rules ----------
export interface DataIssue { code: 'BR-CT-003' | 'BR-CT-007'; message: string }

/** BR-CT-003 (dates) and BR-CT-007 (line amounts above the contract amount, checked once the ERP provides line amounts, unless amendments/extensions explain it). */
export function dataIssuesFor(c: Contract, children: ContractRecord[]): DataIssue[] {
  const issues: DataIssue[] = [];
  if (c.endDate < c.startDate) issues.push({ code: 'BR-CT-003', message: `The end date (${c.endDate}) is earlier than the start date (${c.startDate}).` });
  const lines = children.filter((k) => k.recordType === 'Variation Order' && k.amount !== undefined);
  const pos = lines.reduce((s, k) => s + (k.amount ?? 0), 0);
  const explained = children.filter((k) => k.recordType === 'Amendment' || k.recordType === 'Time Extension').reduce((s, k) => s + (k.amount ?? 0), 0);
  if (lines.length && pos > c.amount + explained) issues.push({ code: 'BR-CT-007', message: `Variation Order lines total ${pos.toLocaleString('en-GB')} ${c.currency}, above the contract amount of ${c.amount.toLocaleString('en-GB')} ${c.currency}; the amendments and extensions on record (${explained.toLocaleString('en-GB')} ${c.currency}) do not explain the difference.` });
  return issues;
}

/** What the Contract Management team should do next, worked out from the contract's dates and renewal state. */
export function requiredActionFor(c: Contract): string {
  if (c.status === 'Cancelled') return 'None — cancelled in ERP';
  if (c.renewalStatus === 'Renewed') return 'None — renewed';
  if (c.daysRemaining < 0) return c.renewalStatus ? 'Confirm renewal in ERP' : 'Initiate renewal or extension in ERP';
  if (c.daysRemaining <= 2) return 'Decide renewal now (escalated)';
  if (c.daysRemaining <= 5) return 'Confirm renewal with the vendor';
  if (c.daysRemaining <= 15) return c.renewalStatus ? 'Follow up the renewal in ERP' : 'Start renewal in ERP';
  if (c.daysRemaining <= 30) return 'Review contract and plan renewal';
  return 'No action';
}
export const needsAction = (c: Contract) => !/^(No action|None)/.test(requiredActionFor(c));

/** "3 months and 4 days" — the remaining time to the end date, in calendar months and days. */
export function remainingLabel(endDate: string, now = new Date()): string {
  const end = new Date(endDate.slice(0, 10) + 'T00:00:00Z');
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  if (end < start) return `Expired ${plural(Math.round((+start - +end) / 86400000), 'day')} ago`;
  if (+end === +start) return 'Ends today';
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  let anchor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, start.getUTCDate()));
  if (anchor > end) { months--; anchor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, start.getUTCDate())); }
  const days = Math.round((+end - +anchor) / 86400000);
  return [months ? plural(months, 'month') : '', days || !months ? plural(days, 'day') : ''].filter(Boolean).join(' and ');
}

/** Same idea as {@link remainingLabel} but split out to Years, Months and Days for a single selected contract's countdown tile. */
export function expiryCountdown(endDate: string, now = new Date()): string {
  const end = new Date(endDate.slice(0, 10) + 'T00:00:00Z');
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  if (end < start) return `Expired ${plural(Math.round((+start - +end) / 86400000), 'day')} ago`;
  if (+end === +start) return 'Ends today';
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  let anchor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, start.getUTCDate()));
  if (anchor > end) { months--; anchor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, start.getUTCDate())); }
  const days = Math.round((+end - +anchor) / 86400000);
  const years = Math.floor(months / 12);
  const parts = [years ? plural(years, 'Year') : '', months % 12 ? plural(months % 12, 'Month') : '', days || !months ? plural(days, 'Day') : ''].filter(Boolean);
  return parts.length <= 1 ? parts[0] ?? '0 Days' : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}

// ---------- List rows (contracts and their child records in one table) ----------
export interface ListRow {
  id: string;
  parentId: string;
  reference: string;
  name: string;
  recordType: string;
  parentReference: string;
  contractType: string;
  vendorName: string;
  vendorRef: string;
  poNumber: string;
  startDate: string;
  endDate: string;
  daysRemaining: number;
  remaining: string;
  amount: number | null;
  currency: string;
  status: string;
  level: StatusLevel;
  renewalStatus: string;
  erpReference: string;
  lastSyncedAt: string;
  syncStatus: string;
  department: string;
}

export function statusLevelFor(c: Pick<Contract, 'status' | 'daysRemaining' | 'renewalStatus'>): StatusLevel {
  if (c.status === 'Cancelled') return 'neutral';
  if (c.renewalStatus === 'Renewed') return 'info';
  return daysRemainingToLevel(c.daysRemaining);
}
