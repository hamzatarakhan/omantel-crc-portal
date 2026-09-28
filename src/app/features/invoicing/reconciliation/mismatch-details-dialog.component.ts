import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { AnnexureCompareRow } from '../../../core/services/crc-store.service';
import { DetailsDialogData, QueryLine, differing, diffOf, employeeText, explainByParts, f2, outsideOf, pctText, signed, toleranceOf } from './mismatch';

/** The full story of one mismatched line: the numbers, the tolerance, where the difference is, and how our figure is built. */
@Component({
  selector: 'app-mismatch-details-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule],
  template: `
    <div class="w-full">
      <div class="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-surface-border">
        <div class="min-w-0">
          <h2 class="text-base font-bold text-ink-900">{{ line.label }}</h2>
          <p class="text-xs text-ink-400 mt-0.5">{{ data.vendor }} · {{ data.contract }} · {{ data.period }} · {{ line.linkedTo ? 'Linked to ' + line.linkedTo : 'Contract monthly share' }}</p>
        </div>
        <button type="button" class="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:bg-surface-subtle hover:text-ink-700 shrink-0" (click)="ref.close()"><mat-icon>close</mat-icon></button>
      </div>

      <div class="px-6 py-5 max-h-[74vh] overflow-y-auto flex flex-col gap-5">
        <!-- the numbers -->
        <div class="rounded-xl border border-red-100 bg-red-50/50 px-4 py-3.5">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <div class="text-lg font-extrabold text-status-red tabular-nums">{{ signed(diff) }} OMR <span class="text-sm font-semibold">({{ pct }})</span></div>
            <div class="text-xs text-ink-600">{{ diff < 0 ? 'The vendor invoiced less than we calculated' : 'The vendor invoiced more than we calculated' }}</div>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <div><div class="k">We calculated</div><div class="v">{{ f2(line.calculated) }}</div></div>
            <div><div class="k">Vendor invoiced</div><div class="v">{{ f2(line.vendorAmount) }}</div></div>
            <div><div class="k">Allowed (±{{ data.tolerancePct }}%)</div><div class="v">± {{ f2(tol) }}</div></div>
            <div><div class="k">Outside the allowance by</div><div class="v text-status-red">{{ f2(out) }}</div></div>
          </div>
        </div>

        <!-- who: employee by employee -->
        @if (line.employees; as e) {
          <section>
            <h3 class="text-[13.5px] font-bold text-ink-900 flex items-center gap-1.5"><mat-icon class="!text-lg text-brand-600">groups</mat-icon>Employee by employee</h3>
            <p class="text-xs text-ink-500 mt-1 mb-2.5">The vendor's annexure <b class="text-ink-700">{{ e.fileName }}</b> against our calculation: <b class="text-status-red">{{ e.total }}</b> {{ e.total === 1 ? 'difference' : 'differences' }}{{ e.rows.length ? ', biggest first' : '' }}.</p>
            @if (!e.rows.length) { <p class="text-xs text-status-green font-medium">Every employee matches.</p> }
            <div class="rounded-lg border border-surface-border overflow-hidden text-xs">
              @for (r of e.rows.slice(0, 8); track r.key) {
                <div class="px-3 py-2.5 border-b border-surface-border last:border-0">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0"><div class="font-semibold text-ink-900">{{ r.name }} <span class="font-normal text-ink-400">· ID {{ r.employeeId }} · {{ r.degree }}{{ r.kind === 'Resignation' ? ' · resignation' : '' }}</span></div>
                      <div class="text-ink-500">Vendor billed <b class="text-ink-800">{{ f2(r.theirs) }}</b> · we calculate <b class="text-ink-800">{{ f2(r.ours) }}</b></div></div>
                    <div class="font-bold text-status-red tabular-nums whitespace-nowrap">{{ signed(r.diff) }}</div>
                  </div>
                  <div class="flex flex-wrap gap-1 mt-1.5">
                    @for (why of r.reasons; track why) { <span class="px-1.5 py-0.5 rounded bg-red-50 text-status-red font-medium">{{ why }}</span> }
                    @if (r.days.length) { <span class="px-1.5 py-0.5 rounded bg-amber-50 text-status-amber font-medium">Attendance differs on day{{ r.days.length > 1 ? 's' : '' }} {{ dayList(r) }}</span> }
                  </div>
                </div>
              }
              @if (e.rows.length > 8) { <div class="px-3 py-2 bg-surface-subtle text-ink-500">and {{ e.rows.length - 8 }} more employee{{ e.rows.length - 8 === 1 ? '' : 's' }}.</div> }
            </div>
            @if (data.openComparison && e.rows.length) { <button type="button" class="mt-2 text-xs font-semibold text-brand-700 hover:underline" (click)="ref.close(); data.openComparison()">Open the full employee comparison</button> }
          </section>
        }

        <!-- where -->
        <section>
          <h3 class="text-[13.5px] font-bold text-ink-900 flex items-center gap-1.5"><mat-icon class="!text-lg text-brand-600">my_location</mat-icon>Where the difference is</h3>
          @if (line.compare) {
            <p class="text-xs text-ink-500 mt-1 mb-2.5">Our calculation against the vendor's annexure <b class="text-ink-700">{{ line.compare.fileName }}</b>, part by part.</p>
            <div class="rounded-lg border border-surface-border overflow-hidden text-xs">
              <div class="grid grid-cols-[1.4fr_1fr_1fr_1.2fr] gap-2 px-3 py-2 bg-surface-subtle text-[11px] font-bold uppercase tracking-wide text-ink-500"><span>Part</span><span class="text-right">Ours</span><span class="text-right">Vendor's</span><span class="text-right">Difference</span></div>
              @for (r of line.compare.rows; track r.label) {
                <div class="grid grid-cols-[1.4fr_1fr_1fr_1.2fr] gap-2 px-3 py-2.5 border-t border-surface-border items-start" [class.bg-red-50]="isBiggest(r.label)">
                  <div><div class="font-semibold text-ink-800">{{ r.label }}</div></div>
                  <div class="text-right"><div class="font-medium text-ink-800 tabular-nums">{{ f2(r.ours) }}</div><div class="text-[11px] text-ink-400">{{ r.oursDetail }}</div></div>
                  <div class="text-right"><div class="font-medium text-ink-800 tabular-nums">{{ f2(r.theirs) }}</div><div class="text-[11px] text-ink-400">{{ r.theirsDetail }}</div></div>
                  <div class="text-right">
                    @if (abs(r.theirs - r.ours) < 0.005) { <span class="inline-flex items-center gap-1 text-status-green font-semibold"><mat-icon class="!text-sm">check_circle</mat-icon>Matches</span> }
                    @else {
                      <div class="font-bold tabular-nums" [class.text-status-red]="true">{{ signed(r.theirs - r.ours) }}</div>
                      <div class="mt-1 h-1.5 rounded-full bg-surface-subtle overflow-hidden"><div class="h-full rounded-full bg-status-red" [style.width.%]="share(r.theirs - r.ours)"></div></div>
                    }
                  </div>
                </div>
              }
              <div class="grid grid-cols-[1.4fr_1fr_1fr_1.2fr] gap-2 px-3 py-2 border-t-2 border-surface-border bg-surface-subtle font-bold text-ink-900">
                <span>Total</span><span class="text-right tabular-nums">{{ f2(oursTotal) }}</span><span class="text-right tabular-nums">{{ f2(theirsTotal) }}</span><span class="text-right tabular-nums text-status-red">{{ signed(theirsTotal - oursTotal) }}</span>
              </div>
            </div>
            @if (biggest; as b) {
              <p class="text-xs text-ink-700 mt-2.5 leading-relaxed"><b>The biggest difference is in {{ b.label }}</b> — {{ signed(b.diff) }} OMR ({{ b.share }}% of the total gap): the vendor's file has <b>{{ b.theirsDetail }}</b>, ours has <b>{{ b.oursDetail }}</b>.</p>
            }
            @if (abs(theirsTotal - line.vendorAmount) >= 0.005) {
              <p class="text-[11px] text-status-amber mt-1.5">The invoice amount ({{ f2(line.vendorAmount) }}) is not the annexure total ({{ f2(theirsTotal) }}) — it was typed over the annexure figure.</p>
            }
          } @else if (explained) {
            <p class="text-sm text-ink-800 mt-2 leading-relaxed">The vendor's amount of <b>{{ f2(line.vendorAmount) }}</b> equals our calculation <b>without {{ leftText }}</b>.</p>
            <div class="mt-2 rounded-lg border border-surface-border text-xs">
              @for (p of explained.left; track p.label) { <div class="flex justify-between gap-4 px-3 py-2 border-b border-surface-border last:border-0 bg-red-50"><span class="text-ink-700">Left out: <b>{{ p.label }}</b></span><span class="font-semibold text-status-red tabular-nums">{{ f2(p.amount) }}</span></div> }
            </div>
          } @else {
            <div class="mt-2 rounded-lg border border-dashed border-surface-border bg-surface-subtle/60 px-4 py-3 text-xs text-ink-600 leading-relaxed">
              <p>The vendor gave <b>one total</b> for this line, so the difference cannot be placed inside it — it is <b>{{ signed(diff) }} OMR</b> against the whole line.</p>
              <p class="mt-1.5 text-ink-500">To see it tier by tier, import the vendor's annexure on the Annexure tab of Reconciliation{{ line.parts.length ? ', or ask the vendor for the breakdown of this amount. Our own breakdown is below for them to compare' : '' }}.</p>
            </div>
          }
        </section>

        <!-- how ours is built -->
        <section>
          <h3 class="text-[13.5px] font-bold text-ink-900 flex items-center gap-1.5"><mat-icon class="!text-lg text-brand-600">calculate</mat-icon>How we calculated {{ f2(line.calculated) }}</h3>
          @if (line.parts.length) {
            <div class="mt-2 rounded-lg border border-surface-border text-xs">
              @for (p of line.parts; track p.label) { <div class="flex justify-between gap-4 px-3 py-1.5 border-b border-surface-border last:border-0"><span class="text-ink-600">{{ p.label }}</span><span class="font-medium text-ink-800 tabular-nums">{{ f2(p.amount) }}</span></div> }
              <div class="flex justify-between gap-4 px-3 py-1.5 bg-surface-subtle font-bold text-ink-900"><span>Total</span><span class="tabular-nums">{{ f2(line.calculated) }}</span></div>
            </div>
          } @else { <p class="text-xs text-ink-500 mt-1.5">{{ line.basis }}. The vendor bills this line from the contract; there is nothing to recalculate from attendance.</p> }
          @if (line.note) { <p class="text-[11px] text-status-amber mt-1.5">{{ line.note }}</p> }
        </section>
      </div>

      <div class="flex justify-end px-6 py-3.5 border-t border-surface-border bg-surface-subtle">
        <button type="button" class="px-4 py-2 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors" (click)="ref.close()">Close</button>
      </div>
    </div>
  `,
  styles: [`
    .k { font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: .03em; }
    .v { font-size: 15px; font-weight: 700; color: #191733; font-variant-numeric: tabular-nums; }
  `],
})
export class MismatchDetailsDialogComponent {
  f2 = f2;
  signed = signed;
  abs = Math.abs;
  line: QueryLine;
  diff: number;
  pct: string;
  tol: number;
  out: number;
  explained: ReturnType<typeof explainByParts>;
  leftText: string;
  oursTotal: number;
  theirsTotal: number;
  biggest: (AnnexureCompareRow & { diff: number; share: number }) | null;
  private rows: Array<AnnexureCompareRow & { diff: number }>;
  private gap: number;

  constructor(@Inject(MAT_DIALOG_DATA) public data: DetailsDialogData, public ref: MatDialogRef<MismatchDetailsDialogComponent>) {
    const l = (this.line = data.line);
    this.diff = diffOf(l);
    this.pct = pctText(l);
    this.tol = toleranceOf(l, data.tolerancePct);
    this.out = outsideOf(l, data.tolerancePct);
    this.explained = explainByParts(l);
    this.leftText = (this.explained?.left ?? []).map((p) => p.label).join(' and ');
    this.rows = differing(l);
    this.gap = this.rows.reduce((sum, r) => sum + Math.abs(r.diff), 0);
    this.oursTotal = (l.compare?.rows ?? []).reduce((sum, r) => sum + r.ours, 0);
    this.theirsTotal = (l.compare?.rows ?? []).reduce((sum, r) => sum + r.theirs, 0);
    this.biggest = this.rows[0] ? { ...this.rows[0], share: this.gap ? Math.round((Math.abs(this.rows[0].diff) / this.gap) * 100) : 0 } : null;
  }

  dayList = (r: { days: Array<{ day: number; vendor: string; ours: string }> }) => r.days.slice(0, 6).map((d) => `${d.day} (vendor ${d.vendor}, ours ${d.ours})`).join(', ') + (r.days.length > 6 ? ' …' : '');
  employeeText = employeeText;
  isBiggest = (label: string) => this.biggest?.label === label && this.rows.length > 1;
  share = (d: number) => (this.gap ? (Math.abs(d) / this.gap) * 100 : 0);
}
