import { AnnexureCompareRow, CURRENT_USER } from '../../../core/services/crc-store.service';

/** One invoice line that does not match, with everything needed to see where the difference is. */
export interface QueryLine {
  key: string;
  label: string;
  /** What the line is linked to on Payable Line Mapping (Salary, Incentive, ...), if anything. */
  linkedTo: string | null;
  calculated: number;
  vendorAmount: number;
  /** How our figure is built: one row per part. Empty for a contract-share line. */
  parts: Array<{ label: string; amount: number }>;
  basis?: string;
  note?: string;
  /** Our figure against the vendor's imported annexure, part by part — only when their annexure is loaded. */
  compare?: { fileName: string; rows: AnnexureCompareRow[] };
}
export interface QueryDialogData { vendor: string; contract: string; contractName: string; period: string; to: string; tolerancePct: number; lines: QueryLine[]; selected: string[] }
export interface QueryDialogResult { to: string; subject: string; keys: string[]; comment: string }
export interface DetailsDialogData { vendor: string; contract: string; period: string; tolerancePct: number; line: QueryLine }

export const f2 = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const signed = (n: number) => (Math.abs(n) < 0.005 ? '' : n > 0 ? '+' : '−') + f2(Math.abs(n));
export const diffOf = (l: QueryLine) => l.vendorAmount - l.calculated;
export const pctOf = (l: QueryLine) => (l.calculated ? (diffOf(l) / l.calculated) * 100 : 0);
export const pctText = (l: QueryLine) => `${pctOf(l) > 0 ? '+' : pctOf(l) < 0 ? '−' : ''}${Math.abs(pctOf(l)).toFixed(1)}%`;
export const toleranceOf = (l: QueryLine, tolPct: number) => Math.abs(l.calculated) * (tolPct / 100);
export const outsideOf = (l: QueryLine, tolPct: number) => Math.max(0, Math.abs(diffOf(l)) - toleranceOf(l, tolPct));
export const shortLabel = (label: string) => label.split(' · ')[0];

/** The rows of the annexure comparison that actually differ, biggest first. */
export function differing(l: QueryLine): Array<AnnexureCompareRow & { diff: number }> {
  return (l.compare?.rows ?? []).map((r) => ({ ...r, diff: r.theirs - r.ours })).filter((r) => Math.abs(r.diff) >= 0.005).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

/**
 * With only a single total from the vendor, the one thing we can still say is whether their amount is our calculation with some
 * whole parts left out (or, with the parts summed differently, added). Returns the parts their amount equals, and the ones left out.
 */
export function explainByParts(l: QueryLine): { kept: string[]; left: Array<{ label: string; amount: number }> } | null {
  const parts = l.parts.filter((p) => Math.abs(p.amount) >= 0.005);
  if (parts.length < 2 || parts.length > 12) return null;
  const slack = Math.max(0.5, Math.abs(l.vendorAmount) * 0.002);
  let best: { mask: number; bits: number } | null = null;
  for (let mask = 1; mask < (1 << parts.length) - 1; mask++) {
    let sum = 0, bits = 0;
    for (let i = 0; i < parts.length; i++) if (mask & (1 << i)) { sum += parts[i].amount; bits++; }
    if (Math.abs(sum - l.vendorAmount) <= slack && (!best || bits > best.bits)) best = { mask, bits };
  }
  if (!best) return null;
  const kept = parts.filter((_, i) => best!.mask & (1 << i)), left = parts.filter((_, i) => !(best!.mask & (1 << i)));
  return { kept: kept.map((p) => shortLabel(p.label)), left: left.map((p) => ({ label: shortLabel(p.label), amount: p.amount })) };
}

/** The email exactly as the vendor receives it. */
export function emailBody(d: { vendor: string; contract: string; contractName: string; period: string; tolerancePct: number }, lines: QueryLine[], comment: string): string {
  const out: string[] = [];
  out.push(`Dear ${d.vendor},`, '', `We checked your ${d.period} invoice for contract ${d.contract} (${d.contractName}). The lines below do not match our calculation; the allowed difference is ±${d.tolerancePct}%.`, '');
  lines.forEach((l, i) => {
    const df = diffOf(l);
    out.push(`${i + 1}. ${l.label}${l.linkedTo ? ` (linked to ${l.linkedTo})` : ''}`);
    out.push(`   Your invoice:      ${f2(l.vendorAmount)} OMR`, `   Our calculation:   ${f2(l.calculated)} OMR`);
    out.push(`   Difference:        ${signed(df)} OMR (${pctText(l)}) — you invoiced ${f2(Math.abs(df))} OMR ${df < 0 ? 'less' : 'more'} than we calculated`);
    out.push(`   Allowed:           ±${f2(toleranceOf(l, d.tolerancePct))} OMR — the difference is outside it by ${f2(outsideOf(l, d.tolerancePct))} OMR`);
    const where = differing(l);
    if (l.compare) {
      out.push(`   Where the difference is (your annexure ${l.compare.fileName} against our calculation):`);
      if (where.length) where.forEach((r) => out.push(`     - ${r.label}: yours ${f2(r.theirs)} (${r.theirsDetail}), ours ${f2(r.ours)} (${r.oursDetail}) → ${signed(r.diff)}`));
      else out.push('     - no difference in any part of the annexure.');
      if (l.compare.rows.length > where.length) out.push('     All other parts match.');
    } else {
      const ex = explainByParts(l);
      if (ex) out.push(`   Where the difference is: your amount equals our calculation without ${ex.left.map((p) => `${p.label} (${f2(p.amount)})`).join(' and ')}.`);
    }
    out.push('   How we calculated it:');
    if (l.parts.length) { l.parts.forEach((p) => out.push(`     - ${p.label}: ${f2(p.amount)}`)); out.push(`     = ${f2(l.calculated)} OMR`); }
    else out.push(`     - ${l.basis ?? 'Contract share'}`);
    out.push('');
  });
  const inv = lines.reduce((s, l) => s + l.vendorAmount, 0), calc = lines.reduce((s, l) => s + l.calculated, 0);
  if (lines.length > 1) out.push(`Together: you invoiced ${f2(inv)} OMR, we calculated ${f2(calc)} OMR (${signed(inv - calc)} OMR).`, '');
  out.push(comment.trim() || '[your comment]', '', 'Kind regards,', CURRENT_USER, 'Omantel Customer Care');
  return out.join('\n');
}
