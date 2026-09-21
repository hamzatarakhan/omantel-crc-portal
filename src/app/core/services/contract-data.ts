import { Contract, ContractAttachment, ContractRecord, ContractTimelineEvent, NotificationRule, PurchaseOrder } from '../models/domain';

export const DEPARTMENT_BY_TYPE: Record<string, string> = {
  'Manpower Outsourcing': 'Customer Care — Contact Centre', 'Facilities Management': 'Facilities & Administration', 'IT Support': 'IT Operations',
  'Training Services': 'Learning & Development', 'Recruitment Services': 'HR & Talent Acquisition',
};

/** Does a notification rule apply to this contract (type, vendor and department scope)? */
export function ruleApplies(r: NotificationRule, c: Contract): boolean {
  return r.active && (r.contractType === 'All Contracts' || r.contractType === c.contractType)
    && (!r.vendor || r.vendor === 'All vendors' || r.vendor === c.vendorName)
    && (!r.department || r.department === 'All departments' || r.department === c.department);
}

/**
 * Sample ERP data behind every contract's detail tabs. Everything here is derived from the contract itself
 * (dates, amount, type, vendor) with a stable hash, so each contract always shows the same, internally
 * consistent set of variation order lines, attachments and history — and follows the contract when an ERP sync moves its dates.
 */

const DAY = 86400000;
const parse = (iso: string) => new Date(iso.slice(0, 10) + 'T12:00:00Z');
const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => new Date(parse(iso).getTime() + n * DAY).toISOString().slice(0, 10);
export const addMonths = (iso: string, n: number) => {
  const d = parse(iso);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};
const diffDays = (a: string, b: string) => Math.round((parse(a).getTime() - parse(b).getTime()) / DAY);
const minIso = (a: string, b: string) => (a < b ? a : b);

export function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const MANAGERS = ['Salim Al-Habsi', 'Mariam Al-Kindi', 'Khalid Al-Farsi', 'Noor Al-Rawahi', 'Talal Al-Amri'];
const ERP_USERS = ['Contracts Admin (ERP)', 'Procurement Officer (ERP)', 'Legal Counsel (ERP)'];
/** The main Infoline contract: its scope-of-work lines exactly as they appear in Omantel's current sheet. */
const INFOLINE_REF = '2025-013T-00-01';
const INFOLINE_PO = '325100185';
const INFOLINE_LINES: Array<[string, string?]> = [
  ['Infoline Salary'], ['Non Voice', '325100186'], ['Voice', '325100186'], ['Manage service Incentive'], ['Performance Allowance'], ['Over time'], ['CSR leave settlement'],
  ['Incentive Telesales'], ['Incentive EBU - Telesales'], ['Incentive Retention & Device'], ['Incentive Debt collection'],
  ['End year Performance Telesales'], ['End year Performance Telesales EBU'], ['End year Performance Retention'], ['End year Performance Debt collection'],
];

interface Template { description: (vendor: string) => string; scope: string[]; terms: string; renewal: string; lines: string[] }
const TEMPLATES: Record<string, Template> = {
  'Manpower Outsourcing': {
    description: (v) => `Secondment of bilingual customer service representatives by ${v} to Omantel's Customer Care contact centre, including payroll, management fee, overtime and replacement cover.`,
    scope: ['Bilingual (Arabic/English) agents for Sales, Retention, Complaints and Billing queues', 'Monthly payroll, management fee and overtime billed against attendance', 'Agent onboarding, OJT and replacement within 10 working days'],
    terms: 'Monthly in arrears, net 30 days from a validated tax invoice', renewal: 'Renewable for one further year by mutual written agreement', lines: ['Salary', 'Incentive', 'Over time', 'Management fee'],
  },
  'Facilities Management': {
    description: (v) => `Integrated facilities management of Omantel Customer Care premises by ${v}: cleaning, maintenance, security and pantry services.`,
    scope: ['Daily cleaning and waste management', 'Preventive and corrective maintenance (HVAC, electrical, plumbing)', 'Access control and on-site security cover'],
    terms: 'Quarterly in advance, net 45 days', renewal: 'Renewable annually, subject to performance review', lines: ['Cleaning and waste management', 'Maintenance (HVAC, electrical, plumbing)', 'Security and access control'],
  },
  'IT Support': {
    description: (v) => `Level 1 and Level 2 IT support for contact-centre systems (CRM, telephony, workstations) delivered by ${v}.`,
    scope: ['Service desk 07:00–23:00, Sunday to Thursday', 'Workstation, headset and telephony support', 'Monthly SLA and incident reporting'],
    terms: 'Monthly in arrears, net 30 days', renewal: 'Renewable for two further 12-month terms', lines: ['Service desk', 'Workstation and telephony support', 'SLA and incident reporting'],
  },
  'Training Services': {
    description: (v) => `Product, process and soft-skills training for Omantel Customer Care agents delivered by ${v}.`,
    scope: ['Induction training for new joiners', 'Refresher and product-launch training', 'Assessment and certification reports'],
    terms: 'Per training batch, net 30 days from completion certificate', renewal: 'Renewable annually', lines: ['Induction training', 'Refresher and product-launch training', 'Assessment and certification'],
  },
  'Recruitment Services': {
    description: (v) => `Sourcing, screening and interview coordination of contact-centre candidates by ${v}, integrated with the WFO recruitment pool.`,
    scope: ['Candidate sourcing and CV screening', 'Interview scheduling with scored question banks', 'Onboarding paperwork and joining follow-up'],
    terms: 'Per successful hire, net 30 days after joining date', renewal: 'Renewable annually', lines: ['Candidate sourcing and screening', 'Interview coordination', 'Onboarding follow-up'],
  },
};
const templateFor = (c: Contract): Template => TEMPLATES[c.contractType] ?? TEMPLATES['Manpower Outsourcing'];

/** Fills the ERP / commercial fields and normalises every top-level contract to a Parent Contract. */
export function enrichContract(c: Contract, i: number): Contract {
  const t = templateFor(c);
  const signed = addDays(c.startDate, -(9 + (i % 8)));
  return {
    ...c,
    recordType: 'Parent Contract',
    parentReference: undefined,
    description: t.description(c.vendorName),
    scope: t.scope,
    department: DEPARTMENT_BY_TYPE[c.contractType] ?? 'Customer Care — Contact Centre',
    contractManager: MANAGERS[i % MANAGERS.length],
    paymentTerms: t.terms,
    signedDate: signed,
    signatory: `Chief Consumer Officer (Omantel) · Managing Director (${c.vendorName})`,
    renewalOption: t.renewal,
    erpVendorId: 'VEN-' + (7000 + (hash(c.vendorName) % 900)),
    erpStatus: c.status === 'Cancelled' ? 'Cancelled' : c.daysRemaining < 0 ? 'Expired' : 'Open',
    erpCreatedAt: addDays(signed, 1),
    erpModifiedAt: addDays(today(), -(3 + (i % 9))),
    poNumber: c.reference === INFOLINE_REF ? INFOLINE_PO : '3251' + String(hash(c.reference) % 100000).padStart(5, '0'),
  };
}

/**
 * What the ERP holds under a contract: its single PO's lines (shown as Variation Orders, each with a scope of work), plus amendments and
 * time extensions. Line amounts are not read from the ERP yet, so they stay empty and show as "—".
 */
/**
 * The purchase orders of a contract: its main PO (whose value is the contract amount plus any amendments) and every other PO number
 * found on its lines. Amounts of the other POs are not read from the ERP yet.
 */
export function purchaseOrdersFor(c: Contract, children: ContractRecord[]): PurchaseOrder[] {
  const numbers = [...new Set([c.poNumber ?? '', ...children.map((k) => k.poNumber)].filter(Boolean))];
  return numbers.map((po): PurchaseOrder => {
    const main = po === c.poNumber;
    const recs = children.filter((k) => k.poNumber === po);
    const known = recs.filter((k) => k.amount !== undefined);
    const extra = known.reduce((s, k) => s + (k.amount ?? 0), 0);
    const status: PurchaseOrder['status'] = main ? c.status : recs.every((k) => k.status === 'Closed') ? 'Closed' : recs.some((k) => k.status === 'Expiring Soon') ? 'Expiring Soon' : 'Active';
    const cats = [...new Set(recs.map((k) => k.recordType))];
    return {
      poNumber: po, main, poType: c.contractType === 'Manpower Outsourcing' ? 'Outsource' : 'Standard', category: main ? 'Original PO' : cats.join(' + ') || 'Variation Order',
      amount: main ? c.amount + extra : known.length ? extra : undefined, currency: c.currency,
      poDate: main ? c.signedDate ?? c.startDate : recs.map((k) => k.issuedDate).sort()[0] ?? c.startDate,
      startDate: main ? c.startDate : recs.map((k) => k.startDate).sort()[0] ?? c.startDate, endDate: main ? c.endDate : recs.map((k) => k.endDate).sort().reverse()[0] ?? c.endDate,
      status, parentReference: c.reference, erpReference: 'ERP-PO-' + po, documents: recs.reduce((s, k) => s + k.attachments, 0), records: recs,
    };
  });
}

export function childRecordsFor(c: Contract): ContractRecord[] {
  const t = templateFor(c);
  const now = today();
  const s = c.startDate;
  const e = c.endDate;
  const cut = (n: number) => minIso(addMonths(s, n), e);
  const out: ContractRecord[] = [];
  const status = (end: string, days: number): ContractRecord['status'] => (days < 0 ? 'Closed' : days <= 30 ? 'Expiring Soon' : 'Active');
  const base = (id: string, prefix: string, key: string) => ({ id: `${c.id}-${id}`, parentId: c.id, parentReference: c.reference, erpReference: `ERP-${prefix}-${10000 + (hash(c.reference + key) % 90000)}`, currency: c.currency });

  const lines: Array<[string, string?]> = c.reference === INFOLINE_REF ? INFOLINE_LINES : t.lines.map((l) => [l] as [string, string?]);
  lines.forEach(([scope, po], i) => {
    const days = diffDays(e, now);
    out.push({
      ...base(`L${i + 1}`, 'SC', 'L' + i), reference: `${c.reference}/L${String(i + 1).padStart(2, '0')}`, poNumber: po ?? c.poNumber ?? '', recordType: 'Variation Order', description: scope, counterparty: c.vendorName,
      issuedDate: s, startDate: s, endDate: e, status: status(e, days), daysRemaining: days, attachments: 0,
    });
  });

  const extra = (n: number, recordType: 'Amendment' | 'Time Extension', prefix: string, description: string, issued: string, start: string, end: string, amount: number) => {
    const days = diffDays(end, now);
    out.push({
      ...base(prefix + n, prefix, prefix + n), reference: `${c.reference}/${prefix}-${String(n).padStart(2, '0')}`, poNumber: c.poNumber ?? '', recordType, description, counterparty: c.vendorName,
      issuedDate: issued, startDate: start, endDate: end, amount, status: status(end, days), daysRemaining: days, attachments: 1,
    });
  };
  extra(1, 'Amendment', 'AM', 'Amendment No. 1 — rate revision', cut(3), cut(3), e, Math.round(c.amount * 0.02));
  if (c.renewalStatus) extra(1, 'Time Extension', 'TE', 'Time extension — end date extended by 90 days', addDays(e, -20), addDays(e, 1), addDays(e, 90), 0);
  return out;
}

export interface YearlyBudgetLine { line: number; description: string; scope: string; allocated: number }
export interface YearlyBudgetYear { year: number; description: string; startDate: string; endDate: string; allocated: number; lines: YearlyBudgetLine[] }

/**
 * The contract's budget by contract year (start date + 12 months, ...), each year holding one line per Variation Order line of the PO.
 * A contract of one year or less has a single year with the contract's own start and end date. Not read from the ERP yet: the amount
 * is split across years by days and across a year's lines evenly, the last one taking the rounding.
 * ponytail: even split and scope picked round-robin from the contract scope, replace with the ERP per-line data when it is synced.
 */
export function yearlyBudgetFor(c: Contract, children: ContractRecord[]): YearlyBudgetYear[] {
  const spans: Array<[string, string]> = [];
  for (let s = c.startDate; s <= c.endDate; s = addMonths(c.startDate, 12 * spans.length)) spans.push([s, minIso(addDays(addMonths(s, 12), -1), c.endDate)]);
  const total = diffDays(c.endDate, c.startDate) + 1;
  const names = children.filter((k) => k.recordType === 'Variation Order').map((k) => k.description);
  if (!names.length) names.push(c.name);
  const scopes = c.scope?.length ? c.scope : templateFor(c).scope;
  const split = (amount: number, n: number, i: number) => (i === n - 1 ? amount - Math.round(amount / n) * (n - 1) : Math.round(amount / n));
  let left = c.amount;
  return spans.map(([startDate, endDate], y) => {
    const allocated = y === spans.length - 1 ? left : Math.round((c.amount * (diffDays(endDate, startDate) + 1)) / total);
    left -= allocated;
    return { year: y + 1, description: `Year ${y + 1} of ${spans.length} — ${c.name}`, startDate, endDate, allocated, lines: names.map((description, i) => ({ line: i + 1, description, scope: scopes[i % scopes.length], allocated: split(allocated, names.length, i) })) };
  });
}

const DOC_LABEL: Record<ContractRecord['recordType'], string> = { 'Variation Order': 'Variation Order agreement', Amendment: 'Amendment letter', 'Time Extension': 'Time-extension letter' };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** Documents held in the ERP for the contract and for each linked record. */
export function attachmentsFor(c: Contract, children: ContractRecord[]): ContractAttachment[] {
  const base: Array<[string, string]> = [['Signed agreement', 'signed-agreement'], ['Commercial offer / BOQ', 'commercial-offer'], ['Vendor registration & tax certificate', 'vendor-tax-certificate']];
  if (c.amount >= 60000) base.push(['Performance bank guarantee', 'bank-guarantee']);
  if (c.contractType === 'Manpower Outsourcing' || c.contractType === 'Facilities Management') base.push(['Insurance certificate', 'insurance-certificate']);
  const items: Array<{ name: string; type: string; category: string; linkedTo: string; uploadedAt: string }> = base.map(([type, file]) => ({ name: `${c.reference}-${file}.pdf`, type, category: 'Contract document', linkedTo: c.reference, uploadedAt: c.signedDate ?? c.startDate }));
  for (const ch of children.filter((k) => k.attachments > 0)) items.push({ name: `${ch.reference.replace('/', '-')}-${slug(DOC_LABEL[ch.recordType])}.pdf`, type: DOC_LABEL[ch.recordType], category: 'Contract change document', linkedTo: ch.reference, uploadedAt: ch.issuedDate });
  return items.map((it, i) => {
    const h = hash(c.reference + it.name);
    return {
      id: `${c.id}-A${i + 1}`, name: it.name, type: it.type, linkedTo: it.linkedTo,
      erpAttachmentId: `ATT-${10000 + (h % 89999)}`, erpDocumentRef: `${c.erpReference}/DOC-${String(i + 1).padStart(2, '0')}`,
      sizeKb: 90 + (h % 2300), category: it.category, version: `v${1 + (h % 3)}.0`, source: 'ERP document store', uploadedBy: ERP_USERS[h % ERP_USERS.length], uploadedAt: it.uploadedAt, syncedAt: c.lastSyncedAt.slice(0, 10),
    };
  });
}

/** Everything that has happened to the contract: ERP sync events, links, alerts sent and escalation. Newest first. */
export function timelineFor(c: Contract, children: ContractRecord[], attachments: ContractAttachment[], rules: NotificationRule[], esc: { hours: number; applies: boolean } = { hours: 48, applies: true }): ContractTimelineEvent[] {
  const now = Date.now();
  const at = (date: string, time: string) => `${date}T${time}`;
  const past = (iso: string) => new Date(iso + 'Z').getTime() - 4 * 3600000 <= now;
  const ev: ContractTimelineEvent[] = [];
  let n = 0;
  const push = (e: Omit<ContractTimelineEvent, 'id' | 'result'> & { result?: ContractTimelineEvent['result'] }) => {
    if (past(e.at)) ev.push({ ...e, id: `${c.id}-E${++n}`, result: e.result ?? 'Success' });
  };

  const created = addDays(c.signedDate ?? c.startDate, 1);
  push({ at: at(created, '02:04:00'), kind: 'created', title: 'Record created from ERP', details: `${c.erpReference} imported for ${c.vendorName} (${c.contractType}).`, actor: 'System (Scheduled Sync)' });
  push({ at: at(created, '02:05:00'), kind: 'attachments', title: `${attachments.length} attachments synced`, details: 'Signed agreement and supporting documents pulled from the ERP document store.', actor: 'System (Scheduled Sync)' });
  push({ at: at(created, '02:10:00'), kind: 'notice', title: 'New contract registered', details: `${c.contractManager} was notified that ${c.reference} is now tracked in CRC.`, actor: 'System (Notification Engine)', channel: 'Email + In-App', recipients: 'Contract Management Team' });
  const lineCount = children.filter((k) => k.recordType === 'Variation Order').length;
  if (lineCount) push({ at: at(c.startDate, '02:06:00'), kind: 'linked', title: `${lineCount} variation order lines linked`, details: `PO ${c.poNumber}: ${children.filter((k) => k.recordType === 'Variation Order').slice(0, 4).map((k) => k.description).join(', ')}${lineCount > 4 ? ` and ${lineCount - 4} more` : ''}.`, actor: 'System (Scheduled Sync)' });
  for (const ch of children.filter((k) => k.recordType !== 'Variation Order')) push({ at: at(ch.issuedDate, '02:06:00'), kind: 'linked', title: `${ch.recordType} linked`, details: `${ch.reference} (${ch.erpReference})${ch.amount ? ' · ' + ch.amount.toLocaleString() + ' ' + ch.currency : ''} · ${ch.description}.`, actor: 'System (Scheduled Sync)' });
  if (c.renewalStatus) push({ at: at(addDays(c.endDate, -45), '09:12:00'), kind: 'renewal', title: 'Renewal initiated in ERP', details: `${c.renewalStatus} — flagged by ${c.contractManager}.`, actor: c.contractManager ?? 'Contract Manager' });

  const cancelled = c.status === 'Cancelled';
  if (cancelled) push({ at: at(addDays(c.endDate, -20), '02:00:00'), kind: 'sync', title: 'Status changed in ERP: Active → Cancelled', details: 'The contract was cancelled in the ERP. It is removed from active screens and kept for historical reporting.', actor: 'System (Scheduled Sync)' });
  for (const r of cancelled ? [] : rules.filter((x) => ruleApplies(x, c))) {
    const failed = hash(c.reference + r.id) % 11 === 0;
    push({
      at: at(addDays(c.endDate, -r.thresholdDays), '08:00:00'), kind: 'alert', title: `Expiry alert — ${r.thresholdDays} days before expiry`,
      details: failed ? `${r.channel.split(' ')[0]} delivery failed (mailbox full) — re-sent in-app.` : `Sent to ${r.recipients}.`,
      actor: 'System (Notification Engine)', channel: r.channel, recipients: r.recipients, ruleLabel: `${r.contractType} · ${r.thresholdDays} days`, result: failed ? 'Failed' : 'Success',
    });
  }
  if (!cancelled && esc.applies && c.renewalStatus !== 'Renewed') push({
    at: at(addDays(c.endDate, -Math.ceil(esc.hours / 24)), '08:00:00'), kind: 'escalation', title: `Escalated to Senior Management (${esc.hours} hours before expiry)`,
    details: c.renewalStatus ? `Renewal status: ${c.renewalStatus}.` : 'No renewal on record — action required.', actor: 'System (Notification Engine)', channel: 'Email + SMS + In-App', recipients: 'Senior Management (Escalation)',
  });

  const d = today();
  push({ at: at(addDays(d, -8), '02:00:00'), kind: 'sync', title: 'Nightly synchronization', details: 'Attachments refreshed; no field changes.', actor: 'System (Scheduled Sync)' });
  push({ at: at(addDays(d, -1), '02:00:00'), kind: 'sync', title: 'Nightly synchronization', details: 'No changes found.', actor: 'System (Scheduled Sync)' });
  return ev.sort((a, b) => (a.at < b.at ? 1 : -1));
}
