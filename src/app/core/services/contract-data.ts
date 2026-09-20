import { Contract, ContractAttachment, ContractRecord, ContractTimelineEvent, NotificationRule } from '../models/domain';

/**
 * Sample ERP data behind every contract's detail tabs. Everything here is derived from the contract itself
 * (dates, amount, type, vendor) with a stable hash, so each contract always shows the same, internally
 * consistent set of child POs, attachments and history — and follows the contract when an ERP sync moves its dates.
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
const SUBVENDOR: Record<string, string> = { 'Manpower Outsourcing': 'Tech Bridge Solutions', 'IT Support': 'Reliance Outsourcing', 'Facilities Management': 'Al-Waha Facilities' };

interface Template { description: (vendor: string) => string; scope: string[]; terms: string; renewal: string; poLabel: string; subScope: string }
const TEMPLATES: Record<string, Template> = {
  'Manpower Outsourcing': {
    description: (v) => `Secondment of bilingual customer service representatives by ${v} to Omantel's Customer Care contact centre, including payroll, management fee, overtime and replacement cover.`,
    scope: ['Bilingual (Arabic/English) agents for Sales, Retention, Complaints and Billing queues', 'Monthly payroll, management fee and overtime billed against attendance', 'Agent onboarding, OJT and replacement within 10 working days'],
    terms: 'Monthly in arrears, net 30 days from a validated tax invoice', renewal: 'Renewable for one further year by mutual written agreement', poLabel: 'manpower call-off', subScope: 'Training and quality-coaching services',
  },
  'Facilities Management': {
    description: (v) => `Integrated facilities management of Omantel Customer Care premises by ${v}: cleaning, maintenance, security and pantry services.`,
    scope: ['Daily cleaning and waste management', 'Preventive and corrective maintenance (HVAC, electrical, plumbing)', 'Access control and on-site security cover'],
    terms: 'Quarterly in advance, net 45 days', renewal: 'Renewable annually, subject to performance review', poLabel: 'facilities call-off', subScope: 'Specialist HVAC maintenance',
  },
  'IT Support': {
    description: (v) => `Level 1 and Level 2 IT support for contact-centre systems (CRM, telephony, workstations) delivered by ${v}.`,
    scope: ['Service desk 07:00–23:00, Sunday to Thursday', 'Workstation, headset and telephony support', 'Monthly SLA and incident reporting'],
    terms: 'Monthly in arrears, net 30 days', renewal: 'Renewable for two further 12-month terms', poLabel: 'IT support call-off', subScope: 'Telephony platform licences',
  },
  'Training Services': {
    description: (v) => `Product, process and soft-skills training for Omantel Customer Care agents delivered by ${v}.`,
    scope: ['Induction training for new joiners', 'Refresher and product-launch training', 'Assessment and certification reports'],
    terms: 'Per training batch, net 30 days from completion certificate', renewal: 'Renewable annually', poLabel: 'training batch', subScope: 'Course content development',
  },
  'Recruitment Services': {
    description: (v) => `Sourcing, screening and interview coordination of contact-centre candidates by ${v}, integrated with the WFO recruitment pool.`,
    scope: ['Candidate sourcing and CV screening', 'Interview scheduling with scored question banks', 'Onboarding paperwork and joining follow-up'],
    terms: 'Per successful hire, net 30 days after joining date', renewal: 'Renewable annually', poLabel: 'recruitment batch', subScope: 'Background verification services',
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
    department: 'Customer Care — Contact Centre',
    contractManager: MANAGERS[i % MANAGERS.length],
    paymentTerms: t.terms,
    signedDate: signed,
    signatory: `Chief Consumer Officer (Omantel) · Managing Director (${c.vendorName})`,
    renewalOption: t.renewal,
    erpVendorId: 'VEN-' + (7000 + (hash(c.vendorName) % 900)),
    erpStatus: c.daysRemaining < 0 ? 'Expired' : 'Open',
    erpCreatedAt: addDays(signed, 1),
    erpModifiedAt: addDays(today(), -(3 + (i % 9))),
    poNumber: '3251' + String(hash(c.reference) % 100000).padStart(5, '0'),
  };
}

/** Purchase orders, subcontracts, amendments and time extensions linked to the contract in the ERP. */
const PO_CATEGORY: Record<ContractRecord['recordType'], ContractRecord['poCategory']> = { 'Purchase Order': 'Original PO', Amendment: 'Amendment', 'Time Extension': 'Time extension', Subcontract: 'Subcontract' };

export function childRecordsFor(c: Contract): ContractRecord[] {
  const t = templateFor(c);
  const now = today();
  const s = c.startDate;
  const e = c.endDate;
  const cut = (n: number) => minIso(addMonths(s, n), e);
  const out: ContractRecord[] = [];
  const mk = (n: number, recordType: ContractRecord['recordType'], prefix: string, description: string, counterparty: string, issued: string, start: string, end: string, share: number) => {
    const days = diffDays(end, now);
    out.push({
      id: `${c.id}-${prefix}${n}`, parentId: c.id, parentReference: c.reference, reference: String(325000000 + (hash(c.reference + prefix + n + 'po') % 999999)),
      poType: recordType === 'Subcontract' ? 'Outsource PO' : 'Standard PO', poCategory: PO_CATEGORY[recordType], recordType, description, counterparty,
      erpReference: `ERP-${prefix}-${10000 + (hash(c.reference + prefix + n) % 90000)}`, issuedDate: issued, startDate: start, endDate: end,
      amount: Math.round(c.amount * share), currency: c.currency, status: days < 0 ? 'Closed' : days <= 30 ? 'Expiring Soon' : 'Active', daysRemaining: days, attachments: 1,
    });
  };
  mk(1, 'Purchase Order', 'PO', `First ${t.poLabel}`, c.vendorName, s, s, cut(4), 0.35);
  if (cut(4) < e) mk(2, 'Purchase Order', 'PO', `Second ${t.poLabel}`, c.vendorName, cut(4), cut(4), cut(8), 0.3);
  if (cut(8) < e) mk(3, 'Purchase Order', 'PO', `Third ${t.poLabel}`, c.vendorName, cut(8), cut(8), e, 0.2);
  mk(1, 'Amendment', 'AM', 'Amendment No. 1 — rate revision', c.vendorName, cut(3), cut(3), e, 0.02);
  const sub = SUBVENDOR[c.contractType];
  if (sub) mk(1, 'Subcontract', 'SC', `Subcontract — ${t.subScope}`, sub, cut(1), cut(1), e, 0.1);
  if (c.renewalStatus) mk(1, 'Time Extension', 'TE', 'Time extension — end date extended by 90 days', c.vendorName, addDays(e, -20), addDays(e, 1), addDays(e, 90), 0);
  return out;
}

const DOC_LABEL: Record<ContractRecord['recordType'], string> = { 'Purchase Order': 'Purchase order', Subcontract: 'Subcontract agreement', Amendment: 'Amendment letter', 'Time Extension': 'Time-extension letter' };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** Documents held in the ERP for the contract and for each linked record. */
export function attachmentsFor(c: Contract, children: ContractRecord[]): ContractAttachment[] {
  const base: Array<[string, string]> = [['Signed agreement', 'signed-agreement'], ['Commercial offer / BOQ', 'commercial-offer'], ['Vendor registration & tax certificate', 'vendor-tax-certificate']];
  if (c.amount >= 60000) base.push(['Performance bank guarantee', 'bank-guarantee']);
  if (c.contractType === 'Manpower Outsourcing' || c.contractType === 'Facilities Management') base.push(['Insurance certificate', 'insurance-certificate']);
  const items: Array<{ name: string; type: string; linkedTo: string; uploadedAt: string }> = base.map(([type, file]) => ({ name: `${c.reference}-${file}.pdf`, type, linkedTo: c.reference, uploadedAt: c.signedDate ?? c.startDate }));
  for (const ch of children) items.push({ name: `${ch.reference}-${slug(DOC_LABEL[ch.recordType])}.pdf`, type: DOC_LABEL[ch.recordType], linkedTo: ch.reference, uploadedAt: ch.issuedDate });
  return items.map((it, i) => {
    const h = hash(c.reference + it.name);
    return {
      id: `${c.id}-A${i + 1}`, name: it.name, type: it.type, linkedTo: it.linkedTo,
      erpAttachmentId: `ATT-${10000 + (h % 89999)}`, erpDocumentRef: `${c.erpReference}/DOC-${String(i + 1).padStart(2, '0')}`,
      sizeKb: 90 + (h % 2300), uploadedBy: ERP_USERS[h % ERP_USERS.length], uploadedAt: it.uploadedAt, syncedAt: c.lastSyncedAt.slice(0, 10),
    };
  });
}

/** Everything that has happened to the contract: ERP sync events, links, alerts sent and escalation. Newest first. */
export function timelineFor(c: Contract, children: ContractRecord[], attachments: ContractAttachment[], rules: NotificationRule[]): ContractTimelineEvent[] {
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
  for (const ch of children) push({ at: at(ch.issuedDate, '02:06:00'), kind: 'linked', title: `${ch.recordType} linked`, details: `${ch.reference} (${ch.erpReference}) · ${ch.amount.toLocaleString()} ${ch.currency} · ${ch.description}.`, actor: 'System (Scheduled Sync)' });
  if (c.renewalStatus) push({ at: at(addDays(c.endDate, -45), '09:12:00'), kind: 'renewal', title: 'Renewal initiated in ERP', details: `${c.renewalStatus} — flagged by ${c.contractManager}.`, actor: c.contractManager ?? 'Contract Manager' });

  for (const r of rules.filter((x) => x.active && (x.contractType === 'All Contracts' || x.contractType === c.contractType))) {
    const failed = hash(c.reference + r.id) % 11 === 0;
    push({
      at: at(addDays(c.endDate, -r.thresholdDays), '08:00:00'), kind: 'alert', title: `Expiry alert — ${r.thresholdDays} days before expiry`,
      details: failed ? `${r.channel.split(' ')[0]} delivery failed (mailbox full) — re-sent in-app.` : `Sent to ${r.recipients}.`,
      actor: 'System (Notification Engine)', channel: r.channel, recipients: r.recipients, ruleLabel: `${r.contractType} · ${r.thresholdDays} days`, result: failed ? 'Failed' : 'Success',
    });
  }
  push({
    at: at(addDays(c.endDate, -2), '08:00:00'), kind: 'escalation', title: 'Escalated to Senior Management (48 hours before expiry)',
    details: c.renewalStatus ? `Renewal status: ${c.renewalStatus}.` : 'No renewal on record — action required.', actor: 'System (Notification Engine)', channel: 'Email + SMS + In-App', recipients: 'Senior Management (Escalation)',
  });

  const d = today();
  push({ at: at(addDays(d, -8), '02:00:00'), kind: 'sync', title: 'Nightly synchronization', details: 'Attachments refreshed; no field changes.', actor: 'System (Scheduled Sync)' });
  push({ at: at(addDays(d, -1), '02:00:00'), kind: 'sync', title: 'Nightly synchronization', details: 'No changes found.', actor: 'System (Scheduled Sync)' });
  return ev.sort((a, b) => (a.at < b.at ? 1 : -1));
}
