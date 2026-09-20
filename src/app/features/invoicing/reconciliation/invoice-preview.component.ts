import { Component, computed, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CrcStore } from '../../../core/services/crc-store.service';

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const rest = r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? ' ' + ONES[r % 10] : '');
  return [h ? ONES[h] + ' Hundred' : '', rest].filter(Boolean).join(' ');
}

function words(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  if (millions) parts.push(below1000(millions) + ' Million');
  if (thousands) parts.push(below1000(thousands) + ' Thousand');
  if (rest) parts.push(below1000(rest));
  return parts.join(' ');
}

const VENDOR_PROFILE: Record<string, { bank: string; account: string; address: string; vatin: string }> = {
  'Infoline LLC': { bank: 'Bank Muscat (SAOG)', account: '0423-01076197-0013', address: 'PO Box 134, Ruwi 112, Sultanate of Oman', vatin: 'OM1100013304' },
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FALLBACK_PROFILE = { bank: 'As registered in the ERP vendor master', account: '—', address: '—', vatin: '—' };

/** The vendor's monthly tax invoice, laid out like the one Omantel receives today, filled from the reconciliation data. */
@Component({
  selector: 'app-invoice-preview',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  template: `
    <div class="flex items-center gap-2 flex-wrap mb-3">
      <span class="status-chip" [class]="statusClass()">{{ status() }}</span>
      <span class="text-xs text-ink-400">Preview of the invoice as it should read. Values come from the attendance sheet, payable rules and hires/resignations.</span>
      <button mat-flat-button color="primary" class="ml-auto" (click)="print()"><mat-icon class="!text-base !mr-1">print</mat-icon>Print / Save as PDF</button>
    </div>

    <div class="invoice-sheet bg-white text-black mx-auto max-w-[900px] overflow-x-auto" style="font-family: 'Times New Roman', Times, serif; font-size: 12.5px; line-height: 1.35;">
      <div class="min-w-[720px]">
        <div class="text-center text-[19px] font-bold pb-1">TAX INVOICE</div>

        <div class="border border-black flex">
          <div class="flex-1 p-2 border-r border-black">
            <div class="font-bold">Oman Telecommunications Company (S.A.O.G)</div>
            <div class="font-bold">PO Box. 789, Postal Code 112, Ruwi,</div>
            <div class="font-bold">Sultanate of Oman</div>
            <div class="font-bold">Ph. 2463 1330 Fax. 2469 7066</div>
            <div class="font-bold mt-8">Kind Attn : Mr. Said Salim Hamood Al-Naabi, Senior Manager, Contact Centre.</div>
            <div class="font-bold pl-[68px]">Mr. Mohammed Ahmed Mohammed Al Riyami, G.M. Customer Care</div>
            <div class="font-bold mt-5">Invoice Month &nbsp;&nbsp;&nbsp;&nbsp;{{ monthShort() }}</div>
          </div>
          <div class="w-[290px] shrink-0">
            <div class="flex border-b border-black"><div class="w-[100px] p-1.5 font-bold border-r border-black">INV. No.</div><div class="flex-1 p-1.5 text-center font-bold" [style.background]="invNo() ? '' : '#ffff00'">{{ invNo() || '' }}</div></div>
            <div class="flex border-b border-black"><div class="w-[100px] p-1.5 font-bold border-r border-black">INV. Date</div><div class="flex-1 p-1.5 text-center font-bold">{{ invDate() }}</div></div>
            <div class="flex border-b border-black"><div class="w-[100px] p-1.5 font-bold border-r border-black">VATIN No:</div><div class="flex-1 p-1.5 text-center font-bold">OM1100006083</div></div>
            <div class="flex"><div class="w-[100px] p-1.5 font-bold border-r border-black">Ref.:</div><div class="flex-1 p-1.5 text-center font-bold text-[11px] leading-snug">{{ ref() }}</div></div>
          </div>
        </div>

        <div class="border border-t-0 border-black flex">
          <div class="flex-1 border-r border-black">
            <div class="p-1 font-bold border-b border-black">Place of Supply : Sultanate of Oman</div>
            <div class="p-1 font-bold">Date of Supply: {{ supplyFrom() }} to {{ supplyTo() }}</div>
          </div>
          <div class="w-[290px] shrink-0 flex">
            <div class="w-[100px] p-1 font-bold border-r border-black flex items-center">Payment Due Date</div>
            <div class="flex-1 p-1 text-center font-bold flex items-center justify-center">{{ dueDate() }}</div>
          </div>
        </div>

        <table class="w-full border-collapse border border-t-0 border-black">
          <thead>
            <tr class="font-bold text-center" style="background: #f8cbad;">
              <th class="border border-black p-2 w-[50px]">S. No.</th>
              <th class="border border-black p-2">Description Of Goods Or Services</th>
              <th class="border border-black p-2 w-[60px]">Units</th>
              <th class="border border-black p-2 w-[110px]">Rate (RO) per Unit</th>
              <th class="border border-black p-2 w-[70px]">Vat Rate</th>
              <th class="border border-black p-2 w-[120px]">Amount (RO)</th>
            </tr>
          </thead>
          <tbody>
            <tr><td class="border-x border-black"></td><td class="border-x border-black text-center underline font-bold pt-3 pb-1" colspan="5">Charges for Manpower Outsourcing for Oman Mobile</td></tr>
            <tr>
              <td class="border-x border-black text-center font-bold align-top">A<br />1)</td>
              <td class="border-x border-black" colspan="5"><span class="underline font-bold">Bi-Lingual Resources - 1234 &amp; Service delivery processes for the month of {{ monthLong() }}</span><br /><span class="italic font-bold">Degree and Rate Value</span></td>
            </tr>
            @for (t of tiers(); track t.name) {
              <tr class="italic">
                <td class="border-x border-black"></td>
                <td class="border-x border-black text-center">{{ t.name }}</td>
                <td class="border-x border-black text-center font-bold not-italic">{{ t.units }}</td>
                <td class="border-x border-black text-center font-bold not-italic">{{ f3(t.rate) }}</td>
                <td class="border-x border-black text-center font-bold not-italic">5%</td>
                <td class="border-x border-black text-right font-bold not-italic pr-1">{{ f3(t.amount) }}</td>
              </tr>
            }
            <tr><td class="border-x border-black h-4"></td><td class="border-x border-black"></td><td class="border-x border-black"></td><td class="border-x border-black"></td><td class="border-x border-black"></td><td class="border-x border-black"></td></tr>
            @for (l of extraLines(); track l.no) {
              <tr>
                <td class="border-x border-black text-center font-bold">{{ l.no }})</td>
                <td class="border-x border-black font-bold pt-2 pb-1">{{ l.label }}</td>
                <td class="border-x border-black text-center font-bold">{{ l.units }}</td>
                <td class="border-x border-black text-center font-bold">{{ f3(l.rate) }}</td>
                <td class="border-x border-black text-center font-bold">5%</td>
                <td class="border-x border-black text-right font-bold pr-1" [class.text-red-700]="l.amount < 0">{{ f3(l.amount) }}</td>
              </tr>
            }
            <tr><td class="border-x border-black h-6"></td><td class="border-x border-black"></td><td class="border-x border-black"></td><td class="border-x border-black"></td><td class="border-x border-black"></td><td class="border-x border-black"></td></tr>
          </tbody>
          <tfoot class="font-bold">
            <tr><td class="border border-black p-1" colspan="5">Total Non-Taxable Value in Omani Rials</td><td class="border border-black p-1"></td></tr>
            <tr><td class="border border-black p-1" colspan="5">Total Taxable Value</td><td class="border border-black p-1 text-right">{{ f3(calc().subtotal) }}</td></tr>
            <tr><td class="border border-black p-1" colspan="5">VAT 5%</td><td class="border border-black p-1 text-right">{{ f3(calc().vat) }}</td></tr>
            <tr><td class="border border-black p-1" colspan="5">Net Invoice Value Including VAT</td><td class="border border-black p-1 text-right">{{ f3(calc().total) }}</td></tr>
            <tr><td class="border border-black p-1" colspan="6">{{ totalInWords() }}</td></tr>
          </tfoot>
        </table>

        <div class="flex justify-between mt-6 px-1">
          <div class="font-bold">
            <div>Details of Payment transfer:</div>
            <div class="mt-5 font-normal">Beneficiary :</div>
            <div class="text-[14px]">{{ vendor() }}</div>
            <div class="font-normal">Bank a/c no. {{ profile().account }}</div>
            <div class="font-normal">Bank Name : {{ profile().bank }}</div>
            <div class="font-normal">{{ profile().address }}</div>
            <div class="mt-5">{{ vendor().split(' ')[0] }} VATIN No. {{ profile().vatin }}</div>
          </div>
          <div class="font-bold text-center self-start pt-5 pr-6">
            <div>For {{ vendor() }}</div>
            <div class="mt-16">Authorised Signatory</div>
          </div>
        </div>
      </div>
    </div>

    <div class="max-w-[900px] mx-auto mt-4 text-xs text-ink-400 leading-relaxed no-print">
      <strong class="text-ink-500">How the lines are built:</strong> tier units are the vendor's agents on the payroll before this month, at the tier billing rate; absences (A) on the attendance sheet become the deduction line;
      agents who joined this month are billed pro-rata under New Joining; resignations are billed pro-rata to the last day plus leave encashment (gross ÷ 30 per day); the 3 Clicks incentive follows the call-duration rule. Confirm these conventions with Omantel.
    </div>
  `,
})
export class InvoicePreviewComponent {
  store = inject(CrcStore);
  vendor = input.required<string>();

  calc = computed(() => this.store.calculateInvoice(this.vendor()));
  run = computed(() => this.store.invoiceRuns()[this.vendor()]);
  status = computed(() => this.run()?.status ?? 'Draft — not yet validated');
  statusClass = computed(() => ({ 'Not started': 'status-chip--neutral', Validated: 'status-chip--normal', 'Flagged for review': 'status-chip--red', 'Approved for payment': 'status-chip--info' } as Record<string, string>)[this.run()?.status ?? 'Not started']);
  payment = computed(() => this.store.payments().find((p) => p.id === this.run()?.paymentId));
  invNo = computed(() => this.payment()?.invoiceRef ?? '');
  profile = computed(() => VENDOR_PROFILE[this.vendor()] ?? FALLBACK_PROFILE);

  private get monthStart() {
    const [y, m] = this.store.periodStart().split('-').map(Number);
    return new Date(y, m - 1, 1);
  }
  private get monthEnd() {
    const [y, m] = this.store.periodStart().split('-').map(Number);
    return new Date(y, m, 0);
  }
  private mon = (d: Date) => MONTHS[d.getMonth()];
  private fmt = (d: Date) => d.getDate() + '-' + this.mon(d) + '-' + d.getFullYear();

  invDate = computed(() => this.fmt(this.monthEnd));
  dueDate = computed(() => this.fmt(new Date(this.monthEnd.getTime() + 30 * 86400000)));
  supplyFrom = computed(() => this.monthStart.getDate() + ' ' + this.mon(this.monthStart) + ' ' + this.monthStart.getFullYear());
  supplyTo = computed(() => this.monthEnd.getDate() + ' ' + this.mon(this.monthEnd) + ' ' + this.monthEnd.getFullYear());
  monthShort = computed(() => this.mon(this.monthStart) + '-' + String(this.monthStart.getFullYear()).slice(2));
  monthLong = computed(() => this.mon(this.monthStart) + ' ' + this.monthStart.getFullYear());

  ref = computed(() => {
    const contracts = this.store.contracts();
    const c = contracts.find((x) => x.vendorName === this.vendor() && x.contractType === 'Manpower Outsourcing') ?? contracts.find((x) => x.vendorName === this.vendor());
    return c ? `Agreement #${c.reference} for Secondment of CSRs to work and PO # ${c.erpReference}` : 'Agreement / PO reference from the ERP';
  });

  tiers = computed(() => this.calc().tiers.map((t) => ({ name: t.degree === 'Diploma' ? 'Diploma Holder' : t.degree === 'Non-Diploma' ? 'Non Diploma Holder' : 'Bachelor', units: t.headcount, rate: t.rate, amount: t.gross })));

  extraLines = computed(() => {
    const c = this.calc();
    const perAbsentDay = c.absentDays ? c.absenceDeduction / c.absentDays : 0;
    const lines = [
      { no: 2, label: 'Additional : Resignation', units: c.resignation.units, rate: c.resignation.units ? c.resignation.amount / c.resignation.units : 0, amount: c.resignation.amount },
      { no: 3, label: 'Additional : New Joining', units: c.newJoining.units, rate: c.newJoining.units ? c.newJoining.amount / c.newJoining.units : 0, amount: c.newJoining.amount },
      { no: 4, label: 'Deduction for Absents', units: c.absentDays, rate: perAbsentDay, amount: c.absenceDeduction > 0.0005 ? -c.absenceDeduction : 0 },
      { no: 5, label: `Additional : 3 Clicks incentive (calls of ${c.threshold}s or more)`, units: c.eligibleCalls, rate: 0.05, amount: c.incentive },
    ];
    return c.incentiveIncluded ? lines : lines.slice(0, 3);
  });

  totalInWords = computed(() => {
    const total = Math.round(this.calc().total * 1000);
    const rials = Math.floor(total / 1000);
    const baisa = total % 1000;
    return `Omani Rial ${words(rials)}${baisa ? ` and Bzs ${String(baisa).padStart(3, '0')}/1000` : ''} Only.`;
  });

  f3(n: number): string {
    return n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  }

  print() {
    window.print();
  }
}
