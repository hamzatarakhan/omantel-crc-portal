import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { RequiresDirective } from '../../../shared/directives/requires.directive';
import { CrcStore, PayableLineItem, VENDOR_CONTACT, WFO_LABEL } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { InvoiceLineDetail, VendorQuery } from '../../../core/models/domain';
import { StatusLevel } from '../../../core/models/status';
import { AnnexureComponent } from './annexure.component';
import { TransactionInvoiceComponent } from './transaction-invoice.component';
import { TxChannel } from '../../../core/services/transaction-invoice-import';
import { OvertimeFileComponent } from './overtime-file.component';
import { MsIncentiveComponent } from './ms-incentive.component';
import { VendorQueryDialogComponent } from './vendor-query-dialog.component';
import { PaymentDocumentsDialogComponent, SubmitPackage } from './payment-documents-dialog.component';
import { MismatchDetailsDialogComponent } from './mismatch-details-dialog.component';
import { ReviewFilesDialogComponent, ReviewFilesData, ReviewFilesOpen } from './review-files-dialog.component';
import { QueryDialogData, QueryDialogResult, QueryLine } from './mismatch';
import { DIALOG_SIZE } from '../../../shared/dialog-sizes';

const VENDORS = ['Infoline LLC', 'Green Umbrella Services'];
const FIELD = 'w-full px-2.5 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 focus:outline-none focus:border-brand-400';

/** Where a line is in its journey: validate it, then approve it if it matches — or email the vendor if it does not. */
type LineStatus = 'Annexure needed' | 'Invoice needed' | 'Overtime needed' | 'MS Incentive needed' | 'Not validated' | 'Matches' | 'Does not match' | 'Queried with vendor' | 'Submitted for approval' | 'Rejected' | 'Approved for payment';
const STATUS_LEVEL: Record<LineStatus, StatusLevel> = { 'Annexure needed': 'amber', 'Invoice needed': 'amber', 'Overtime needed': 'amber', 'MS Incentive needed': 'amber', 'Not validated': 'neutral', Matches: 'normal', 'Does not match': 'red', 'Queried with vendor': 'amber', 'Submitted for approval': 'amber', Rejected: 'red', 'Approved for payment': 'info' };

@Component({
  selector: 'app-reconciliation',
  standalone: true,
  imports: [RequiresDirective, AnnexureComponent, TransactionInvoiceComponent, OvertimeFileComponent, MsIncentiveComponent, CommonModule, FormsModule, RouterModule, MatIconModule, PageHeaderComponent, StatusChipComponent, KpiCardComponent],
  template: `
    <app-page-header
      [title]="store.ownVendor() ? 'Claiming' : 'Reconciliation Workspace'"
      [subtitle]="store.ownVendor() ? 'Claim your invoice line by line — import your files, validate against our calculation, then submit for approval' : 'Check what a vendor invoiced on a contract against our calculation, line by line — approve what matches, query the rest with the vendor'"
      [breadcrumbs]="[{ label: 'Invoicing & Payments', link: '/invoicing/reconciliation' }, { label: store.ownVendor() ? 'Claiming' : 'Reconciliation Workspace' }]"
    >
      @if (store.ownVendor()) {
        <span class="status-chip" [class]="claimingClosed() ? 'status-chip--neutral' : 'status-chip--normal'">{{ claimingClosed() ? 'Claiming closed' : 'Claiming open until ' + (store.claimingPeriod().endAt | date:'d MMM, HH:mm') }}</span>
      }
      <span class="status-chip status-chip--neutral">{{ periodLabel(period()) }}</span>
      @if (isCurrentPeriod()) { <app-status-chip [label]="status()" [level]="statusLevel()"></app-status-chip> }
      @else { <span class="status-chip status-chip--neutral">History &middot; read-only</span> }
    </app-page-header>

    <!-- 1. Filters — labelled dropdowns, same pattern as the Contract List; hidden inside a file-import sub-page -->
    @if (view() === 'calc') {
    <div class="surface-card px-4 py-3.5 mb-4">
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
        <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Vendor</span>
          @if (store.ownVendor()) {
            <div [class]="field + ' mt-1 !bg-surface-subtle !text-ink-600'">{{ vendor() }}</div>
          } @else {
          <select [class]="field + ' mt-1'" (change)="vendor.set($any($event.target).value)">
            @for (v of vendors; track v) { <option [value]="v" [selected]="v === vendor()">{{ v }}</option> }
          </select>
          }
        </label>
        <label class="block"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Month</span>
          <select [class]="field + ' mt-1'" (change)="period.set($any($event.target).value)">
            @for (m of periods(); track m) { <option [value]="m" [selected]="m === period()">{{ periodLabel(m) }}</option> }
          </select>
        </label>
        <label class="block sm:col-span-2"><span class="text-[10.5px] font-bold text-ink-400 uppercase tracking-wide">Contract</span>
          <select [class]="field + ' mt-1'" (change)="pickContract($any($event.target).value)" [disabled]="!contracts().length">
            @for (c of contracts(); track c.reference) {
              <option [value]="c.reference" [selected]="c.reference === contract()?.reference">{{ c.reference }} · {{ c.name }}</option>
            } @empty { <option>No contract runs in {{ store.period() }}</option> }
          </select>
        </label>
      </div>
    </div>
    }

    @if (!isCurrentPeriod()) {
      <!-- Read-only history: past months show whatever was already validated/approved, from the invoice-run history. Our WFO figures
           are only ever calculated for the current month, so a past month cannot be recalculated here — see importAnnexure(). -->
      <div class="surface-card overflow-hidden">
        <div class="px-4 py-3.5 border-b border-surface-border">
          <h3 class="text-[13.5px] font-bold text-ink-900">Reconciliation history &middot; {{ vendor() }} &middot; {{ periodLabel(period()) }}</h3>
        </div>
        <div class="overflow-x-auto">
          <table class="crc-table w-full">
            <thead><tr class="text-left"><th>Line</th><th class="text-right">Calculated (OMR)</th><th class="text-right">Vendor invoice (OMR)</th><th class="text-right">Difference</th><th>Status</th></tr></thead>
            <tbody>
              @for (r of historicalRuns(); track $index) {
                <tr>
                  <td class="font-semibold text-ink-900">{{ r.lines[0].label }}</td>
                  <td class="text-right tabular-nums">{{ r.calculatedTotal | number:'1.2-2' }}</td>
                  <td class="text-right tabular-nums">{{ r.vendorInvoiceAmount | number:'1.2-2' }}</td>
                  <td class="text-right tabular-nums" [class.text-status-red]="r.status === 'Flagged for review'">{{ (r.vendorInvoiceAmount - r.calculatedTotal) > 0 ? '+' : '' }}{{ r.vendorInvoiceAmount - r.calculatedTotal | number:'1.2-2' }}</td>
                  <td><app-status-chip [label]="r.status" [level]="r.status === 'Approved for payment' ? 'info' : r.status === 'Flagged for review' ? 'red' : 'normal'"></app-status-chip></td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="!text-center text-sm text-ink-400 !py-8">No reconciliation was recorded for {{ vendor() }} in {{ periodLabel(period()) }}.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    } @else if (view() === 'annexure') {
      <button type="button" class="inline-flex items-center gap-1 mb-3 text-xs font-semibold text-brand-700 hover:underline" (click)="view.set('calc')"><mat-icon class="!text-base !w-4 !h-4">arrow_back</mat-icon>Back to payable lines</button>
      <app-annexure [vendor]="vendor()"></app-annexure>
    } @else if (view() === 'transaction') {
      <button type="button" class="inline-flex items-center gap-1 mb-3 text-xs font-semibold text-brand-700 hover:underline" (click)="view.set('calc')"><mat-icon class="!text-base !w-4 !h-4">arrow_back</mat-icon>Back to payable lines</button>
      <app-transaction-invoice [vendor]="vendor()" [channel]="txChannelView()!"></app-transaction-invoice>
    } @else if (view() === 'overtime') {
      <button type="button" class="inline-flex items-center gap-1 mb-3 text-xs font-semibold text-brand-700 hover:underline" (click)="view.set('calc')"><mat-icon class="!text-base !w-4 !h-4">arrow_back</mat-icon>Back to payable lines</button>
      <app-overtime-file [vendor]="vendor()"></app-overtime-file>
    } @else if (view() === 'msIncentive') {
      <button type="button" class="inline-flex items-center gap-1 mb-3 text-xs font-semibold text-brand-700 hover:underline" (click)="view.set('calc')"><mat-icon class="!text-base !w-4 !h-4">arrow_back</mat-icon>Back to payable lines</button>
      <app-ms-incentive [vendor]="vendor()"></app-ms-incentive>
    } @else if (!contract()) {
      <div class="surface-card p-8 text-center text-sm text-ink-500">{{ vendor() }} has no contract running in {{ store.period() }}, so there is nothing to reconcile.</div>
    } @else {

    <!-- 2. Where this contract stands -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      <app-kpi-card label="Calculated" [value]="calculatedTotal() | number:'1.2-2'" unit="OMR" icon="calculate"></app-kpi-card>
      <app-kpi-card label="Vendor invoiced" [value]="vendorTotal() | number:'1.2-2'" unit="OMR" icon="receipt_long"></app-kpi-card>
      <app-kpi-card label="Difference" [value]="(diff() > 0 ? '+' : '') + (diff() | number:'1.2-2')" unit="OMR" icon="compare_arrows" [level]="diffLevel()"></app-kpi-card>
      <app-kpi-card label="Approved lines" [value]="approvedCount() + ' of ' + lines().length" icon="task_alt" [level]="approvedCount() === lines().length ? 'info' : 'neutral'"></app-kpi-card>
    </div>

    <!-- 3. The lines, with the bulk actions on top -->
    <div class="surface-card mb-4 overflow-hidden">
      <div class="flex items-center justify-between gap-3 flex-wrap px-4 py-3.5 border-b border-surface-border">
        <div class="min-w-0">
          <h3 class="text-[13.5px] font-bold text-ink-900">Payable lines &middot; {{ contract()?.reference }}</h3>
          <ol class="flex items-center gap-1.5 flex-wrap list-none p-0 m-0 mt-1 text-[11px] text-ink-400">
            @if (canValidate()) {
              <li><b class="text-ink-600">1</b> Import the file or enter the amount</li><li class="text-ink-300">›</li>
              <li><b class="text-ink-600">2</b> Validate ({{ store.payableRules().deviationPct ? 'within ' + store.payableRules().deviationPct + '% of our calculation' : 'must match our calculation exactly' }})</li><li class="text-ink-300">›</li>
              <li><b class="text-ink-600">3</b> Submit for approval with the invoice and payment certificate</li>
            }
            @if (canValidate() && canApprove()) { <li class="text-ink-300">›</li> }
            @if (canApprove()) {
              <li><b class="text-ink-600">{{ canValidate() ? 4 : 1 }}</b> Review the files, then approve or reject — or email the vendor if it does not match</li>
            }
          </ol>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          @if (store.can('Configure Payable Rules')) {
            <a routerLink="/invoicing/line-mapping" class="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"><mat-icon class="!text-base">link</mat-icon>Payable Line Mapping</a>
          }
          @if (canValidate() && !hasDemoItem('Other Manage Service')) {
            <button type="button" [class]="btnSecondary + ' !border-dashed'" title="Demo: adds an Other Manage Service line (amount capped at the system-calculated share) to test requesting an amount" (click)="addDemoItem('Other Manage Service', null)"><mat-icon [class]="ico">add</mat-icon>Demo: Other Manage Service</button>
          }
          @if (canValidate() && !hasDemoItem('Manage Service Incentive')) {
            <button type="button" [class]="btnSecondary + ' !border-dashed'" title="Demo: adds a Manage Service Incentive line you can fill by importing the vendor's incentive file" (click)="addDemoItem('Manage Service Incentive', 'msIncentive')"><mat-icon [class]="ico">add</mat-icon>Demo: MS Incentive</button>
          }
          @if (canValidate()) {
            <button type="button" [class]="btnSecondary" (click)="validate(validatable())" [disabled]="!validatable().length"><mat-icon [class]="ico">fact_check</mat-icon>Validate selected @if (validatable().length) { <span [class]="pill">{{ validatable().length }}</span> }</button>
            <button type="button" [class]="btnPrimary" (click)="submit(submittable())" [disabled]="!submittable().length || claimingClosed()" [attr.title]="claimingClosed() ? 'The claiming period is closed' : ''"><mat-icon [class]="ico">outbox</mat-icon>Submit for approval @if (submittable().length) { <span class="bg-white/25 rounded-full px-1.5 text-[10px] leading-4">{{ submittable().length }}</span> }</button>
          }
          @if (canApprove()) {
            <button type="button" [class]="btnPrimary" (click)="approve(approvable())" [disabled]="!approvable().length"><mat-icon [class]="ico">task_alt</mat-icon>Approve selected @if (approvable().length) { <span class="bg-white/25 rounded-full px-1.5 text-[10px] leading-4">{{ approvable().length }}</span> }</button>
            <button type="button" [class]="btnDanger" (click)="reject(approvable())" [disabled]="!approvable().length"><mat-icon [class]="ico">block</mat-icon>Reject selected</button>
            <!-- Hidden: the SRS leaves the email-to-vendor step out of the current scope unless it is separately enabled. -->
            @if (false) {
            <button type="button" [class]="btnDanger" (click)="emailVendor()" [disabled]="!queryable().length"><mat-icon [class]="ico">mail</mat-icon>Email vendor @if (queryable().length) { <span class="bg-status-red text-white rounded-full px-1.5 text-[10px] leading-4">{{ queryable().length }}</span> }</button>
            }
          }
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="crc-table w-full">
          <thead>
            <tr class="text-left">
              <th class="w-10"><input type="checkbox" class="w-4 h-4 accent-brand-600 align-middle cursor-pointer" [checked]="allSelected()" (change)="allSelected() ? selectNone() : selectAll()" [disabled]="!openLines().length" title="Select all open lines" /></th>
              <th>Line</th>
              <th class="text-right">Calculated (OMR)</th>
              <th class="text-right">Vendor invoice (OMR)</th>
              <th class="text-right">Difference</th>
              <th>Status</th>
              <th class="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            @for (l of lines(); track l.key) {
              <tr>
                <td>
                  @if (isApproved(l.key)) { <mat-icon class="!text-lg !w-[18px] !h-[18px] text-status-info align-middle" title="Approved">check_circle</mat-icon> }
                  @else { <input type="checkbox" class="w-4 h-4 accent-brand-600 align-middle cursor-pointer" [checked]="isSelected(l.key)" (change)="toggle(l.key)" /> }
                </td>
                <td class="!whitespace-normal min-w-[200px]">
                  <div class="font-semibold text-ink-900">{{ l.label }}</div>
                  <div class="text-[11px] mt-0.5" [class]="l.component ? 'text-brand-700' : 'text-ink-400'">
                    {{ l.component ? 'Linked to ' + wfoLabel[l.component] : 'Contract monthly share — not linked' }}
                    @if (l.txChannel && !txInvoice(l)) { <span> &middot; invoice needed</span> }
                    @if (needsOvertimeFile(l)) { <span> &middot; overtime file needed</span> }
                    @if (needsMsIncentive(l)) { <span> &middot; file needed</span> }
                    @if (l.note) { <span class="text-ink-400"> &middot; {{ l.note }}</span> }
                  </div>
                </td>
                <td class="text-right font-medium text-ink-900 tabular-nums">{{ needsTxInvoice(l) ? '—' : (calculatedAmount(l) | number:'1.2-2') }}</td>
                <td class="text-right">
                  @if (!canValidate()) {
                    <div class="text-sm font-semibold tabular-nums text-ink-900">{{ needsTxInvoice(l) ? '—' : (vendorAmount(l.key) | number:'1.2-2') }}</div>
                  } @else if (isSalary(l)) {
                    @if (annexureClaim(l) !== undefined) {
                      <div class="text-sm font-semibold tabular-nums text-ink-900">{{ vendorAmount(l.key) | number:'1.2-2' }}</div>
                      <button type="button" class="text-[11px] font-semibold text-brand-600 hover:underline mt-0.5" (click)="view.set('annexure')">From the annexure &middot; view</button>
                    } @else {
                      <button type="button" class="inline-flex items-center gap-1 h-7 px-2 text-xs font-semibold rounded-md border border-solid border-brand-200 text-brand-700 bg-white hover:bg-brand-50" (click)="view.set('annexure')"><mat-icon class="!text-sm !w-4 !h-4">upload_file</mat-icon>Import annexure</button>
                    }
                  } @else if (isTxLine(l)) {
                    @if (txInvoice(l)) {
                      <div class="text-sm font-semibold tabular-nums text-ink-900">{{ vendorAmount(l.key) | number:'1.2-2' }}</div>
                      <button type="button" class="text-[11px] font-semibold text-brand-600 hover:underline mt-0.5" (click)="openTxInvoice(l)">From the invoice &middot; view</button>
                    } @else {
                      <button type="button" class="inline-flex items-center gap-1 h-7 px-2 text-xs font-semibold rounded-md border border-solid border-brand-200 text-brand-700 bg-white hover:bg-brand-50" (click)="openTxInvoice(l)"><mat-icon class="!text-sm !w-4 !h-4">upload_file</mat-icon>Import {{ l.txChannel }}</button>
                    }
                  } @else if (isOvertimeLine(l)) {
                    @if (overtimeClaim(l) !== undefined) {
                      <div class="text-sm font-semibold tabular-nums text-ink-900">{{ vendorAmount(l.key) | number:'1.2-2' }}</div>
                      <button type="button" class="text-[11px] font-semibold text-brand-600 hover:underline mt-0.5" (click)="view.set('overtime')">From the overtime file &middot; view</button>
                    } @else {
                      <button type="button" class="inline-flex items-center gap-1 h-7 px-2 text-xs font-semibold rounded-md border border-solid border-brand-200 text-brand-700 bg-white hover:bg-brand-50" (click)="view.set('overtime')"><mat-icon class="!text-sm !w-4 !h-4">upload_file</mat-icon>Import overtime</button>
                    }
                  } @else if (isPerformanceLine(l) || isIncentiveLine(l)) {
                    <div class="text-sm font-semibold tabular-nums text-ink-900">{{ vendorAmount(l.key) | number:'1.2-2' }}</div>
                    <div class="text-[11px] text-ink-400 mt-0.5">Same as our calculation</div>
                  } @else if (isMsIncentiveLine(l)) {
                    @if (msIncentiveClaim(l) !== undefined) {
                      <div class="text-sm font-semibold tabular-nums text-ink-900">{{ vendorAmount(l.key) | number:'1.2-2' }}</div>
                      <button type="button" class="text-[11px] font-semibold text-brand-600 hover:underline mt-0.5" (click)="view.set('msIncentive')">From the file &middot; view</button>
                    } @else {
                      <button type="button" class="inline-flex items-center gap-1 h-7 px-2 text-xs font-semibold rounded-md border border-solid border-brand-200 text-brand-700 bg-white hover:bg-brand-50" (click)="view.set('msIncentive')"><mat-icon class="!text-sm !w-4 !h-4">upload_file</mat-icon>Import file</button>
                    }
                  } @else {
                  <input type="number" step="0.01" min="0" class="w-32 h-8 text-right text-sm font-medium tabular-nums bg-white border border-surface-border rounded-lg px-2.5 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-surface-subtle disabled:text-ink-500 disabled:border-transparent" [ngModel]="vendorAmount(l.key)" (ngModelChange)="setVendorAmount(l.key, +$event)" [disabled]="isLocked(l.key)" />
                  @if (isCapped(l)) { <div class="text-[11px] text-ink-400 mt-0.5">Up to {{ l.calculated | number:'1.2-2' }}</div> }
                  @if (fromAnnexure(l.key)) { <div class="text-[11px] text-brand-600 mt-0.5">From the vendor's annexure</div> }
                  }
                </td>
                <td class="text-right">
                  @if (needsAnnexure(l) || needsTxInvoice(l) || needsOvertimeFile(l) || needsMsIncentive(l)) { <div class="text-ink-300">—</div> } @else {
                  <div class="font-semibold tabular-nums" [class]="diffClass(l)">{{ lineDiff(l) > 0 ? '+' : '' }}{{ lineDiff(l) | number:'1.2-2' }}</div>
                  @if (!same(l)) { <div class="text-[11px] text-ink-400">{{ lineDiff(l) > 0 ? 'Higher' : 'Lower' }} than ours &middot; {{ lineVariance(l) > 0 ? '+' : '' }}{{ lineVariance(l) | number:'1.1-1' }}%</div> }
                  }
                  @if (lineStatus(l.key) === 'Does not match' || lineStatus(l.key) === 'Queried with vendor') { <button type="button" class="mt-0.5 text-[11px] font-semibold text-brand-700 hover:underline" (click)="showDetails(l)">See where it differs</button> }
                </td>
                <td class="!whitespace-normal">
                  <app-status-chip [label]="lineStatus(l.key)" [level]="statusLevels[lineStatus(l.key)]"></app-status-chip>
                  @if (lineStatus(l.key) === 'Queried with vendor') { <div class="text-[11px] text-ink-400 mt-1">Emailed {{ queriedAt(l.key) | date:'d MMM, HH:mm' }} — update the amount when they reply</div> }
                  @if (lineStatus(l.key) === 'Rejected') { <div class="text-[11px] text-status-red mt-1">{{ store.lineRun(vendor(), l.key)?.rejectReason }}</div> }
                  @if (lineStatus(l.key) === 'Submitted for approval') { <div class="text-[11px] text-ink-400 mt-1">Submitted {{ store.lineRun(vendor(), l.key)?.submittedAt | date:'d MMM, HH:mm' }}</div> }
                  @if (store.lineRun(vendor(), l.key)?.adjustments?.length) { <div class="text-[11px] font-semibold mt-0.5" [class]="adjustmentNet(l.key) >= 0 ? 'text-status-normal' : 'text-status-red'">Adjustments {{ adjustmentNet(l.key) >= 0 ? '+' : '−' }}{{ adjustmentAbs(l.key) | number:'1.2-3' }} OMR ({{ store.lineRun(vendor(), l.key)?.adjustments?.length }})</div> }
                </td>
                <td class="text-right">
                  <div class="inline-flex items-center gap-1">
                    @switch (lineStatus(l.key)) {
                      @case ('Approved for payment') { <a routerLink="/invoicing/tracking" [class]="rowBtn + ' text-brand-700 hover:bg-brand-50'" title="Open the payment in Payment Tracking"><mat-icon [class]="icoSm">receipt_long</mat-icon>{{ store.lineRun(vendor(), l.key)?.paymentId }}</a> }
                      @case ('Submitted for approval') {
                        @if (canApprove()) {
                          <button type="button" [class]="rowBtn + ' text-white bg-brand-600 hover:bg-brand-700'" (click)="approve([l.key])"><mat-icon [class]="icoSm">task_alt</mat-icon>Approve</button>
                          <button type="button" [class]="rowBtn + ' text-status-red border border-solid border-red-200 bg-white hover:bg-red-50'" (click)="reject([l.key])"><mat-icon [class]="icoSm">block</mat-icon>Reject</button>
                        } @else { <span class="text-[11px] text-ink-400 px-1">Awaiting approval</span> }
                      }
                      @case ('Matches') {
                        @if (canValidate()) { <button type="button" [class]="rowBtn + ' text-white bg-brand-600 hover:bg-brand-700'" (click)="submit([l.key])" [disabled]="claimingClosed()" [attr.title]="claimingClosed() ? 'The claiming period is closed' : ''" [style.opacity]="claimingClosed() ? .45 : 1"><mat-icon [class]="icoSm">outbox</mat-icon>Submit</button> }
                        @else { <span class="text-[11px] text-ink-400 px-1">Not submitted yet</span> }
                      }
                      @case ('Does not match') { @if (false && canApprove()) { <button type="button" [class]="rowBtn + ' text-white bg-status-red hover:bg-red-700'" (click)="emailVendor(l.key)"><mat-icon [class]="icoSm">mail</mat-icon>Email vendor</button> } }
                      @case ('Queried with vendor') { @if (false && canApprove()) { <button type="button" [class]="rowBtn + ' text-status-red border border-solid border-red-200 bg-white hover:bg-red-50'" (click)="emailVendor(l.key)"><mat-icon [class]="icoSm">forward_to_inbox</mat-icon>Email again</button> } }
                      @case ('Annexure needed') { @if (canValidate()) { <button type="button" [class]="rowBtn + ' text-brand-700 border border-solid border-brand-200 bg-white hover:bg-brand-50'" disabled title="Import the vendor's annexure first" style="opacity:.45;cursor:not-allowed"><mat-icon [class]="icoSm">fact_check</mat-icon>Validate</button> } }
                      @case ('Invoice needed') { @if (canValidate()) { <button type="button" [class]="rowBtn + ' text-brand-700 border border-solid border-brand-200 bg-white hover:bg-brand-50'" disabled title="Import the invoice first" style="opacity:.45;cursor:not-allowed"><mat-icon [class]="icoSm">fact_check</mat-icon>Validate</button> } }
                      @case ('Overtime needed') { @if (canValidate()) { <button type="button" [class]="rowBtn + ' text-brand-700 border border-solid border-brand-200 bg-white hover:bg-brand-50'" disabled title="Import the overtime file first" style="opacity:.45;cursor:not-allowed"><mat-icon [class]="icoSm">fact_check</mat-icon>Validate</button> } }
                      @case ('MS Incentive needed') { @if (canValidate()) { <button type="button" [class]="rowBtn + ' text-brand-700 border border-solid border-brand-200 bg-white hover:bg-brand-50'" disabled title="Import the Manage Service Incentive file first" style="opacity:.45;cursor:not-allowed"><mat-icon [class]="icoSm">fact_check</mat-icon>Validate</button> } }
                      @default { @if (canValidate()) { <button type="button" [class]="rowBtn + ' text-brand-700 border border-solid border-brand-200 bg-white hover:bg-brand-50'" (click)="validate([l.key])"><mat-icon [class]="icoSm">fact_check</mat-icon>Validate</button> } }
                    }
                    @if (hasSubmission(l.key)) {
                      <button type="button" [class]="iconBtn" (click)="reviewFiles(l)" title="Review the files"><mat-icon class="!text-lg !w-[18px] !h-[18px]">folder_open</mat-icon></button>
                    }
                    <button type="button" [class]="iconBtn" (click)="toggleExpand(l.key)" [title]="isExpanded(l.key) ? 'Hide how it was calculated' : 'Show how it was calculated'"><mat-icon class="!text-lg !w-[18px] !h-[18px] transition-transform" [class.rotate-180]="isExpanded(l.key)">expand_more</mat-icon></button>
                  </div>
                </td>
              </tr>
              @if (isExpanded(l.key)) {
                <tr>
                  <td class="!border-t-0 !bg-surface-subtle"></td>
                  <td colspan="6" class="!border-t-0 !bg-surface-subtle !whitespace-normal !pt-3">
                    @if (l.source === 'wfo') {
                      <div class="max-w-xl text-xs text-ink-500 bg-white border border-surface-border rounded-lg px-3 py-1.5">
                        @for (b of breakdown(l); track b.label) {
                          <div class="flex justify-between gap-4 py-1.5 border-b border-surface-border last:border-0"><span>{{ b.label }}</span><span class="font-medium text-ink-800 tabular-nums">{{ b.amount | number:'1.2-2' }}</span></div>
                        }
                      </div>
                      <p class="text-[11px] text-ink-400 mt-2">
                        @switch (l.component) {
                          @case ('performance') { Each eligible agent's fixed monthly performance amount (eligible: score above {{ store.payrollRules().omaniMinScore }}% Omani, {{ store.payrollRules().nonOmaniMinScore }}% non-Omani) — amounts and thresholds are set in <a class="text-brand-600 font-medium" routerLink="/csr/performance-settings">Performance Settings</a>. }
                          @case ('overtime') { Overtime hours &times; basic &divide; {{ store.payrollRules().overtimeDays }} days &divide; {{ store.payrollRules().overtimeHoursPerDay }} hours &times; {{ store.payrollRules().overtimePremium }} (&times; {{ store.payrollRules().holidayOvertimePremium }} on an official holiday), per agent — set in <a class="text-brand-600 font-medium" routerLink="/csr/overtime-settings">Overtime Settings</a>. }
                          @case ('incentive') { Calls shorter than {{ calc().threshold }}s don't count — <a class="text-brand-600 font-medium" routerLink="/invoicing/rules">change the rule</a>. }
                          @case ('fee') { The contract's flat management fee per agent per month. }
                          @default { Billing rate &times; billable-day ratio per agent, from the <a class="text-brand-600 font-medium" routerLink="/csr/leave">attendance sheet</a> and the <button type="button" class="text-[11px] text-brand-600 font-medium hover:underline" (click)="view.set('annexure')">annexure</button>. Absence is deducted; approved leave stays billable. }
                        }
                      </p>
                    } @else {
                      <p class="text-xs text-ink-500">{{ l.basis }}{{ l.txChannel ? '.' : '. The vendor bills this line from the contract; there is nothing to recalculate from attendance.' }}</p>
                    }
                  </td>
                </tr>
              }
            } @empty {
              <tr><td colspan="7" class="!text-center text-sm text-ink-400 !py-8">This contract has no lines to pay in {{ store.period() }}.</td></tr>
            }
          </tbody>
          <tfoot>
            <tr class="font-semibold text-ink-900">
              <td></td>
              <td>Total &middot; {{ lines().length }} line{{ lines().length === 1 ? '' : 's' }}</td>
              <td class="text-right tabular-nums">{{ calculatedTotal() | number:'1.2-2' }}</td>
              <td class="text-right tabular-nums">{{ vendorTotal() | number:'1.2-2' }}</td>
              <td class="text-right tabular-nums" [class]="diffLevel() === 'normal' ? 'text-status-normal' : diffLevel() === 'red' ? 'text-status-red' : 'text-ink-400'">{{ diff() > 0 ? '+' : '' }}{{ diff() | number:'1.2-2' }}</td>
              <td colspan="2" class="text-right text-xs font-medium text-ink-400">{{ approvedCount() }} of {{ lines().length }} approved</td>
            </tr>
          </tfoot>
        </table>
      </div>

      @if (queries().length) {
        <div class="border-t border-surface-border px-4 py-3 text-xs text-ink-500">
          <div class="font-semibold text-ink-700 mb-1">Emails sent about {{ contract()?.reference }} for {{ store.period() }}</div>
          @for (q of queries(); track q.id) {
            <div class="flex items-start gap-1.5 py-0.5"><mat-icon class="!text-sm !w-3.5 !h-3.5 mt-0.5 shrink-0">mail_outline</mat-icon><span>{{ q.sentAt | date:'d MMM, HH:mm' }} to {{ q.to }} &middot; {{ lineNames(q) }} &middot; &ldquo;{{ q.comment }}&rdquo;</span></div>
          }
        </div>
      }
    </div>
    @if (approvedCount()) { <p class="text-xs text-ink-400 mb-4">Approved lines are paid from <a class="text-brand-600 font-medium" routerLink="/invoicing/tracking">Payment Tracking</a>.</p> }
    }
  `,
})
export class ReconciliationComponent {
  store = inject(CrcStore);
  private ui = inject(UiService);
  private dialog = inject(MatDialog);

  readonly vendors = VENDORS;
  readonly field = FIELD;
  readonly wfoLabel = WFO_LABEL;
  readonly statusLevels = STATUS_LEVEL;
  readonly ico = '!text-[17px] !w-[17px] !h-[17px]';
  readonly icoSm = '!text-base !w-4 !h-4';
  readonly pill = 'bg-brand-600 text-white rounded-full px-1.5 text-[10px] leading-4';
  readonly btnBase = 'inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold rounded-lg active:scale-[0.97] transition-all disabled:opacity-40 disabled:pointer-events-none';
  readonly btnSecondary = this.btnBase + ' border border-solid border-brand-100 bg-brand-50 text-brand-700 hover:bg-brand-100 hover:border-brand-200';
  readonly btnPrimary = this.btnBase + ' bg-brand-600 text-white hover:bg-brand-700';
  readonly btnDanger = this.btnBase + ' border border-solid border-red-200 bg-white text-status-red hover:bg-red-50';
  readonly rowBtn = 'inline-flex items-center justify-center gap-1 h-8 min-w-[112px] px-2.5 text-xs font-semibold rounded-lg transition-colors';
  readonly iconBtn = 'w-8 h-8 inline-flex items-center justify-center rounded-lg text-ink-400 hover:bg-surface-subtle hover:text-ink-700 transition-colors';

  /** The vendor imports, validates and submits (Validate Invoice); Billing reviews the files and approves or rejects (Approve Invoice). */
  canValidate = computed(() => this.store.can('Validate Invoice'));
  canApprove = computed(() => this.store.can('Approve Invoice'));
  /** A vendor cannot submit outside the claiming period (admin and Billing are never blocked). */
  claimingClosed = computed(() => !!this.store.ownVendor() && !this.store.isClaimingOpenFor(this.contract()?.reference ?? ''));

  vendor = signal(this.store.ownVendor() ?? VENDORS[0]);
  view = signal<'calc' | 'annexure' | 'transaction' | 'overtime' | 'msIncentive'>('calc');
  txChannelView = signal<TxChannel | null>(null);
  /** 'YYYY-MM', defaults to the current month; a past month shows read-only history instead of a live calculation. */
  period = signal(this.store.periodStart().slice(0, 7));
  private contractByVendor = signal<Record<string, string>>({});
  private selectedBy = signal<Record<string, Set<string>>>({});
  private typed = signal<Record<string, number>>({});
  private expandedKeys = signal<Set<string>>(new Set());

  periods = computed(() => this.store.payrollMonths());
  isCurrentPeriod = computed(() => this.period() === this.store.periodStart().slice(0, 7));
  periodLabel = (m: string) => this.store.periodLabel(m);
  historicalRuns = computed(() => (this.store.invoiceRuns()[this.vendor()] ?? []).filter((r) => r.period === this.periodLabel(this.period())));

  contracts = computed(() => (this.store.ownVendor() ? this.store.vendorContracts(this.vendor()).map((c) => ({ ...c, billing: true })) : this.store.payableContracts(this.vendor())));
  contract = computed(() => { const list = this.contracts(); return list.find((c) => c.reference === this.contractByVendor()[this.vendor()]) ?? list[0]; });
  private ctx = computed(() => `${this.vendor()}|${this.contract()?.reference}`);
  calc = computed(() => this.store.calculateInvoice(this.vendor()));
  lines = computed<PayableLineItem[]>(() => { const c = this.contract(); return c ? this.store.payableLines(this.vendor(), c.reference) : []; });
  vendorContact = computed(() => VENDOR_CONTACT[this.vendor()] ?? 'accounts@vendor.example');
  queries = computed(() => this.store.vendorQueries().filter((q) => q.vendor === this.vendor() && q.contract === this.contract()?.reference && q.period === this.store.period()));

  openLines = computed(() => this.lines().filter((l) => !this.isApproved(l.key)));
  selected = computed(() => this.selectedBy()[this.ctx()] ?? new Set(this.openLines().map((l) => l.key)));
  allSelected = computed(() => this.openLines().length > 0 && this.openLines().every((l) => this.selected().has(l.key)));
  validatable = computed(() => this.openLines().filter((l) => this.isSelected(l.key) && this.lineStatus(l.key) !== 'Submitted for approval' && !this.needsAnnexure(l) && !this.needsTxInvoice(l) && !this.needsOvertimeFile(l) && !this.needsMsIncentive(l)).map((l) => l.key));
  /** Validated lines the vendor can send to Billing. */
  submittable = computed(() => this.openLines().filter((l) => this.isSelected(l.key) && this.lineStatus(l.key) === 'Matches').map((l) => l.key));
  /** Lines the vendor has submitted — what Billing approves or rejects. */
  approvable = computed(() => this.openLines().filter((l) => this.isSelected(l.key) && this.lineStatus(l.key) === 'Submitted for approval').map((l) => l.key));
  queryable = computed(() => this.lines().filter((l) => this.lineStatus(l.key) === 'Does not match' || this.lineStatus(l.key) === 'Queried with vendor'));
  approvedCount = computed(() => this.lines().length - this.openLines().length);

  calculatedTotal = computed(() => this.lines().reduce((s, l) => s + this.calculatedAmount(l), 0));
  vendorTotal = computed(() => this.lines().reduce((s, l) => s + this.vendorAmount(l.key), 0));
  diff = computed(() => this.vendorTotal() - this.calculatedTotal());
  diffLevel = computed<StatusLevel>(() => {
    const t = this.calculatedTotal(), d = this.diff();
    if (Math.abs(d) < 0.005) return 'neutral';
    return t && Math.abs(d / t) * 100 <= this.store.payableRules().deviationPct ? 'normal' : 'red';
  });

  status = computed(() => {
    const n = this.lines().length, done = this.approvedCount();
    if (!n) return 'Nothing to reconcile';
    if (done === n) return 'Approved for payment';
    if (done) return `${done} of ${n} approved`;
    return this.lines().some((l) => this.lineStatus(l.key) !== 'Not validated') ? 'In validation' : 'Not started';
  });
  statusLevel = computed<StatusLevel>(() => (this.status() === 'Approved for payment' ? 'info' : this.status() === 'Not started' || this.status() === 'Nothing to reconcile' ? 'neutral' : 'amber'));

  pickContract(ref: string) {
    this.contractByVendor.update((m) => ({ ...m, [this.vendor()]: ref }));
  }

  // ---------- per line ----------
  isApproved(key: string) {
    return this.store.lineRun(this.vendor(), key)?.status === 'Approved for payment';
  }

  /** Once a line is submitted or approved its amount is locked. */
  isLocked(key: string) {
    const st = this.store.lineRun(this.vendor(), key)?.status;
    return st === 'Approved for payment' || st === 'Submitted for approval';
  }

  adjustmentNet(key: string) { return (this.store.lineRun(this.vendor(), key)?.adjustments ?? []).reduce((t, a) => t + (a.type === 'Addition' ? a.amount : -a.amount), 0); }
  adjustmentAbs(key: string) { return Math.abs(this.adjustmentNet(key)); }

  hasDemoItem(label: string) { return this.store.customInvoiceItems().some((i) => i.label === label + ' (demo)' && i.contractRef === this.contract()?.reference); }

  /** Demo only: adds a manual payable line (24,000 OMR a year) so the Other Manage Service cap and the MS Incentive import can be tried. */
  addDemoItem(label: string, component: 'msIncentive' | null) {
    const c = this.contract();
    if (!c) return;
    this.store.addInvoiceItem({ contractRef: c.reference, vendorName: this.vendor(), label: label + ' (demo)', scope: 'Demo line', allocated: 24000, component });
    this.ui.toast(label + ' line added.');
  }

  hasSubmission(key: string) {
    const st = this.store.lineRun(this.vendor(), key)?.status;
    return st === 'Submitted for approval' || st === 'Approved for payment' || st === 'Rejected';
  }

  isSelected(key: string) {
    return this.selected().has(key);
  }

  toggle(key: string) {
    const next = new Set(this.selected());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.selectedBy.update((m) => ({ ...m, [this.ctx()]: next }));
  }

  selectAll() {
    this.selectedBy.update((m) => ({ ...m, [this.ctx()]: new Set(this.openLines().map((l) => l.key)) }));
  }

  selectNone() {
    this.selectedBy.update((m) => ({ ...m, [this.ctx()]: new Set<string>() }));
  }

  isExpanded(key: string) {
    return this.expandedKeys().has(key);
  }

  toggleExpand(key: string) {
    const next = new Set(this.expandedKeys());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.expandedKeys.set(next);
  }

  /** Approved (locked) > manually typed (override) > the vendor's own claim from their imported annexure > our calculation (assumed to match until told otherwise). */
  vendorAmount(key: string): number {
    const run = this.store.lineRun(this.vendor(), key);
    if (run?.status === 'Approved for payment' || run?.status === 'Submitted for approval') return run.lines[0].vendorAmount;
    const line = this.lines().find((l) => l.key === key);
    if (line && this.isSalary(line)) return this.annexureClaim(line) ?? line.calculated;
    if (line && this.isOvertimeLine(line)) return this.overtimeClaim(line) ?? line.calculated;
    if (line && this.isPerformanceLine(line)) return line.calculated;
    if (line && this.isIncentiveLine(line)) return line.calculated;
    if (line && this.isMsIncentiveLine(line)) return this.msIncentiveClaim(line) ?? line.calculated;
    const typed = this.typed()[key];
    if (typed !== undefined) return typed;
    const claimed = this.store.vendorClaim(this.vendor(), line?.component);
    if (claimed !== undefined) return claimed;
    return line?.calculated ?? 0;
  }

  isSalary(l: PayableLineItem) { return l.component === 'salary'; }
  annexureClaim(l: PayableLineItem) { return this.store.vendorClaim(this.vendor(), l.component); }
  /** The Salary line is checked against the vendor's annexure — nothing to compare until one is imported. */
  needsAnnexure(l: PayableLineItem) { return this.isSalary(l) && this.annexureClaim(l) === undefined; }

  isOvertimeLine(l: PayableLineItem) { return l.component === 'overtime'; }
  overtimeClaim(l: PayableLineItem) { return this.store.overtimeClaim(this.vendor()); }
  /** Overtime is already calculated from our WFO data, but it is checked against the vendor's own overtime workbook — nothing to compare until one is imported. */
  needsOvertimeFile(l: PayableLineItem) { return this.isOvertimeLine(l) && this.overtimeClaim(l) === undefined; }

  /** Performance has no vendor file at all — the vendor invoice column just mirrors our own calculation, never typed. */
  isPerformanceLine(l: PayableLineItem) { return l.component === 'performance'; }

  /** Incentive is entirely our own WFO calculation too — the vendor invoice column mirrors it, never typed. */
  isIncentiveLine(l: PayableLineItem) { return l.component === 'incentive'; }

  isMsIncentiveLine(l: PayableLineItem) { return !!l.msIncentive; }
  msIncentiveClaim(l: PayableLineItem) { return this.store.msIncentiveClaim(this.vendor()); }
  needsMsIncentive(l: PayableLineItem) { return this.isMsIncentiveLine(l) && this.msIncentiveClaim(l) === undefined; }

  /** Yearly Performance and Project have no file and no independent calculation — whatever the user types as the vendor invoice is taken as our figure too, so the two columns always agree. */
  isManualMirrorLine(l: PayableLineItem) { return l.component === 'yearlyPerformance' || l.component === 'project'; }
  calculatedAmount(l: PayableLineItem) { return this.isManualMirrorLine(l) ? this.vendorAmount(l.key) : l.calculated; }

  isTxLine(l: PayableLineItem) { return !!l.txChannel; }
  txInvoice(l: PayableLineItem) { return l.txChannel ? this.store.transactionInvoiceFor(this.vendor(), l.txChannel) : undefined; }
  /** Voice and Chat have no independent calculation — the imported transaction invoice IS the figure, on both sides, until one is imported. */
  needsTxInvoice(l: PayableLineItem) { return this.isTxLine(l) && !this.txInvoice(l); }
  openTxInvoice(l: PayableLineItem) { if (l.txChannel) { this.txChannelView.set(l.txChannel); this.view.set('transaction'); } }

  /** True once the vendor invoice field on screen reflects their imported annexure and hasn't been overridden. */
  fromAnnexure(key: string): boolean {
    if (this.typed()[key] !== undefined || this.isLocked(key)) return false;
    const line = this.lines().find((l) => l.key === key);
    return this.store.vendorClaim(this.vendor(), line?.component) !== undefined;
  }

  setVendorAmount(key: string, v: number) {
    this.typed.update((m) => ({ ...m, [key]: Number.isFinite(v) ? v : 0 }));
  }

  lineDiff(l: PayableLineItem) {
    return this.vendorAmount(l.key) - this.calculatedAmount(l);
  }

  lineVariance(l: PayableLineItem) {
    const c = this.calculatedAmount(l); return c ? (this.lineDiff(l) / c) * 100 : 0;
  }

  same(l: PayableLineItem) {
    return Math.abs(this.lineDiff(l)) < 0.005;
  }

  diffClass(l: PayableLineItem) {
    if (this.same(l)) return 'text-ink-400';
    return Math.abs(this.lineVariance(l)) <= this.store.payableRules().deviationPct ? 'text-status-amber' : 'text-status-red';
  }

  /** A validation only counts while the amounts it checked are still the ones on screen. */
  lineStatus(key: string): LineStatus {
    const run = this.store.lineRun(this.vendor(), key);
    const own = this.lines().find((x) => x.key === key);
    const settled = run?.status === 'Approved for payment' || run?.status === 'Submitted for approval';
    if (own && this.needsAnnexure(own) && !settled) return 'Annexure needed';
    if (own && this.needsTxInvoice(own) && !settled) return 'Invoice needed';
    if (own && this.needsOvertimeFile(own) && !settled) return 'Overtime needed';
    if (own && this.needsMsIncentive(own) && !settled) return 'MS Incentive needed';
    if (!run) return 'Not validated';
    if (run.status === 'Approved for payment' || run.status === 'Submitted for approval') return run.status;
    const checked = run.lines[0], now = this.lines().find((x) => x.key === key);
    if (!now || Math.abs(checked.vendorAmount - this.vendorAmount(key)) >= 0.005 || Math.abs(checked.calculated - now.calculated) >= 0.005) return 'Not validated';
    if (run.status === 'Rejected') return 'Rejected';
    if (run.status === 'Validated') return 'Matches';
    return this.lastQuery(key, checked) ? 'Queried with vendor' : 'Does not match';
  }

  private lastQuery(key: string, checked: InvoiceLineDetail) {
    return this.queries().find((q) => q.lines.some((x) => x.key === key && Math.abs(x.vendorAmount - checked.vendorAmount) < 0.005 && Math.abs(x.calculated - checked.calculated) < 0.005));
  }

  queriedAt(key: string) {
    const run = this.store.lineRun(this.vendor(), key);
    return run ? this.lastQuery(key, run.lines[0])?.sentAt : undefined;
  }

  lineNames(q: VendorQuery) {
    return q.lines.map((l) => l.label).join(', ');
  }

  /** How a WFO-calculated line's number was built up. */
  breakdown(l: PayableLineItem): Array<{ label: string; amount: number }> {
    const c = this.calc();
    const fee = c.tiers.reduce((s, t) => s + t.fee, 0);
    switch (l.component) {
      case 'salary': return [
        ...c.tiers.map((t) => ({ label: `${t.degree} tier · ${t.headcount} agents · ${t.billableFte.toFixed(2)} billable FTE`, amount: t.salaryAmount })),
        { label: `New joiners · ${c.newJoining.units} · pro-rata`, amount: c.newJoining.amount },
        { label: `Resignations · ${c.resignation.units} · pro-rata + leave encashment`, amount: c.resignation.amount },
        ...(this.lines().some((x) => x.component === 'fee') ? [{ label: 'Less the management fee, billed on its own line', amount: -fee }] : []),
      ];
      case 'overtime': return c.tiers.map((t) => ({ label: `${t.degree} tier · ${t.headcount} agents · ${t.overtimeHours.toLocaleString('en-GB')} h`, amount: t.overtime }));
      case 'performance': return c.tiers.map((t) => ({ label: `${t.degree} tier · ${t.qualified} of ${t.headcount} agents eligible`, amount: t.performance }));
      case 'fee': return c.tiers.map((t) => ({ label: `${t.degree} tier · ${t.headcount} agents`, amount: t.fee }));
      default: return [{ label: `${c.eligibleCalls.toLocaleString()} eligible calls (of ${c.sampleCalls.toLocaleString()}) × 0.05 OMR`, amount: c.incentive }];
    }
  }

  private details(keys: string[]): InvoiceLineDetail[] {
    return this.lines().filter((l) => keys.includes(l.key)).map((l) => ({ key: l.key, label: l.label, calculated: this.calculatedAmount(l), vendorAmount: this.vendorAmount(l.key) }));
  }

  // ---------- actions ----------
  /** A line with no file and no calculation of its own can be claimed up to our calculated amount, never above it. */
  isCapped(l: PayableLineItem) {
    return !this.isSalary(l) && !this.isOvertimeLine(l) && !this.isTxLine(l) && !this.isMsIncentiveLine(l) && !this.isPerformanceLine(l) && !this.isIncentiveLine(l);
  }

  private overCeiling(l: PayableLineItem) {
    return this.isCapped(l) && this.vendorAmount(l.key) - l.calculated >= 0.005;
  }

  validate(keys: string[]) {
    if (!this.ui.requires('Validate Invoice')) return;
    const over = this.lines().filter((l) => keys.includes(l.key) && this.overCeiling(l)).map((l) => l.label);
    if (over.length) this.ui.toast(`${over.join(', ')}: the amount cannot be above our calculated amount.`, 5000);
    const allowed = keys.filter((k) => !this.lines().some((l) => l.key === k && this.overCeiling(l)));
    if (!allowed.length) return;
    const runs = this.store.validateLines(this.vendor(), this.details(allowed));
    if (!runs.length) return;
    const off = runs.filter((r) => r.status === 'Flagged for review').map((r) => r.lines[0].label);
    const what = runs.length === 1 ? runs[0].lines[0].label : `${runs.length} lines`;
    this.ui.toast(off.length ? `${what} validated — ${off.join(', ')} ${off.length === 1 ? 'does' : 'do'} not match. Correct it and validate again.` : `${what} validated — ready to submit for approval.`, 5000);
  }

  /** The vendor's imported file for the lines being submitted (annexure for Salary, the Voice/Chat invoice, the overtime or incentive file) — attached to the claim as its claiming sheet. */
  private claimingSheetFor(keys: string[]): { name: string; url?: string } | undefined {
    const v = this.vendor();
    for (const k of keys) {
      const l = this.lines().find((x) => x.key === k);
      if (!l) continue;
      const key = this.isSalary(l) ? v + '|annexure' : this.isOvertimeLine(l) ? v + '|overtime' : l.txChannel ? v + '|' + l.txChannel : this.isMsIncentiveLine(l) ? v + '|msIncentive' : '';
      const f = key ? this.store.importedFiles()[key] : undefined;
      if (f) return f;
    }
    return undefined;
  }

  /** The vendor sends validated lines to Billing, attaching the invoice and payment certificate (and any other documents). */
  async submit(keys: string[]) {
    if (!this.ui.requires('Validate Invoice')) return;
    const c = this.contract();
    const ok = keys.filter((k) => this.lineStatus(k) === 'Matches');
    if (!c || !ok.length) return;
    const d = this.details(ok);
    const names = d.map((l) => l.label).join(', ');
    const total = Math.round(d.reduce((s, l) => s + l.vendorAmount, 0)).toLocaleString();
    const pack: SubmitPackage | undefined = await this.dialog.open(PaymentDocumentsDialogComponent, { data: { summary: `${names} · ${total} OMR on ${c.reference}`, claimingSheet: this.claimingSheetFor(ok), prefill: ok.some((k) => this.lines().find((l) => l.key === k)?.component === 'salary') ? this.store.pendingAdjustments(this.vendor()) : [] }, panelClass: 'app-dialog-panel', autoFocus: false, ...DIALOG_SIZE.form }).afterClosed().toPromise();
    if (!pack) return;
    const r = this.store.submitLines(this.vendor(), c.reference, ok, pack.documents, pack.adjustments);
    this.ui.toast(r.ok ? `${names} submitted for approval.` : r.reason, 5000);
  }

  /** Billing approves what the vendor submitted; the documents the vendor attached travel with the payment. */
  async approve(keys: string[]) {
    if (!this.ui.requires('Approve Invoice')) return;
    const c = this.contract();
    const ok = keys.filter((k) => this.lineStatus(k) === 'Submitted for approval');
    if (!c || !ok.length) return;
    const d = this.details(ok);
    const names = d.map((l) => l.label).join(', ');
    const net = ok.flatMap((k) => this.store.lineRun(this.vendor(), k)?.adjustments ?? []).reduce((t, a) => t + (a.type === 'Addition' ? a.amount : -a.amount), 0);
    const total = Math.round(d.reduce((s, l) => s + l.vendorAmount, 0) + net).toLocaleString();
    const yes = await this.ui.confirm({
      title: ok.length === 1 ? `Approve ${names} for payment?` : `Approve ${ok.length} lines for payment?`,
      message: `One payment of ${total} OMR on ${c.reference} (${names}) is created and tracked from Pending, with the documents the vendor attached${net ? ` and a net adjustment of ${net > 0 ? '+' : ''}${net.toFixed(2)} OMR` : ''}.`,
      confirmLabel: 'Approve', icon: 'payments',
    });
    if (!yes) return;
    const p = this.store.approveLines(this.vendor(), ok, c.reference);
    this.ui.toast(`Approved — ${p?.id} added to Payment Tracking.`);
  }

  async reject(keys: string[]) {
    if (!this.ui.requires('Approve Invoice')) return;
    const ok = keys.filter((k) => this.lineStatus(k) === 'Submitted for approval');
    if (!ok.length) return;
    const names = this.details(ok).map((l) => l.label).join(', ');
    const v = await this.ui.form({ title: `Reject ${names}?`, subtitle: 'The vendor is told why and can correct and submit again', icon: 'block', submitLabel: 'Reject', fields: [{ key: 'reason', label: 'Reason', type: 'textarea', required: true }] });
    if (!v) return;
    this.store.rejectLines(this.vendor(), ok, v['reason']);
    this.ui.toast('Rejected — the vendor can correct and submit again.');
  }

  /** The files behind a submitted line: the vendor's imported file and the documents they attached. */
  async reviewFiles(l: PayableLineItem) {
    const v = this.vendor(), run = this.store.lineRun(v, l.key);
    const imported: ReviewFilesData['imported'] = [];
    if (this.isSalary(l)) { const f = this.store.vendorAnnexures()[v]?.fileName; if (f) imported.push({ label: 'Annexure (claiming sheet)', file: f, url: this.store.importedFiles()[v + '|annexure']?.url, open: { view: 'annexure' } }); }
    if (this.isOvertimeLine(l)) { const f = this.store.overtimeInvoices()[v]?.fileName; if (f) imported.push({ label: 'Overtime file', file: f, url: this.store.importedFiles()[v + '|overtime']?.url, open: { view: 'overtime' } }); }
    if (l.txChannel) { const f = this.store.transactionInvoiceFor(v, l.txChannel)?.fileName; if (f) imported.push({ label: `${l.txChannel} transaction invoice`, file: f, url: this.store.importedFiles()[v + '|' + l.txChannel]?.url, open: { view: 'transaction', channel: l.txChannel } }); }
    if (this.isMsIncentiveLine(l)) { const f = this.store.msIncentiveInvoices()[v]?.[0]?.fileName; if (f) imported.push({ label: 'Manage Service Incentive file', file: f, url: this.store.importedFiles()[v + '|msIncentive']?.url, open: { view: 'msIncentive' } }); }
    const duplicate = (name: string) => (run?.documents ?? []).some((d) => d.name === name);
    for (let i = imported.length - 1; i >= 0; i--) if (duplicate(imported[i].file)) imported.splice(i, 1);
    const batch = this.lines().map((x) => this.store.lineRun(v, x.key)).filter((r) => r && run?.submittedAt && r.submittedAt === run.submittedAt);
    const adjustments = batch.flatMap((r) => r?.adjustments ?? []);
    const data: ReviewFilesData = { title: l.label, subtitle: `${v} · ${this.contract()?.reference} · ${this.store.period()}`, imported, documents: run?.documents ?? [], adjustments, rejectReason: run?.status === 'Rejected' ? run.rejectReason : undefined };
    const open: ReviewFilesOpen | undefined = await this.dialog.open(ReviewFilesDialogComponent, { data, panelClass: 'app-dialog-panel', autoFocus: false, ...DIALOG_SIZE.form }).afterClosed().toPromise();
    if (!open) return;
    if (open.channel) this.txChannelView.set(open.channel);
    this.view.set(open.view);
  }

  /** Everything the vendor needs to see where a line's difference is: both amounts, what the line is linked to, and how our figure is built. */
  private queryLine(l: PayableLineItem): QueryLine {
    const parts = l.source === 'wfo' ? this.breakdown(l).filter((x) => Math.abs(x.amount) >= 0.005 || l.calculated === 0) : [];
    const emp = l.component === 'salary' ? this.store.annexureEmployees(this.vendor()) : null;
    const employees = emp ? { fileName: emp.fileName, total: emp.rows.filter((r) => r.status !== 'Matches').length, rows: emp.rows.filter((r) => r.status !== 'Matches') } : undefined;
    const compare = this.store.annexureCompare(this.vendor(), l.component, this.lines().some((x) => x.component === 'fee')) ?? undefined;
    return { key: l.key, label: l.label, linkedTo: l.component ? WFO_LABEL[l.component] : null, calculated: this.calculatedAmount(l), vendorAmount: this.vendorAmount(l.key), parts, basis: l.basis, note: l.note, compare, employees };
  }

  /** The full explanation of one mismatched line, without sending anything. */
  showDetails(l: PayableLineItem) {
    const c = this.contract();
    if (!c) return;
    this.dialog.open(MismatchDetailsDialogComponent, { data: { vendor: this.vendor(), contract: c.reference, period: this.store.period(), tolerancePct: this.store.payableRules().deviationPct, line: this.queryLine(l), openComparison: () => this.view.set('annexure') }, panelClass: 'app-dialog-panel', autoFocus: false, width: 'min(860px, 94vw)', maxWidth: '94vw' });
  }

  /** One email to the vendor: each chosen line with the exact difference and how we calculated it, then the user's comment. */
  async emailVendor(onlyKey?: string) {
    if (!this.ui.requires('Approve Invoice')) return;
    const c = this.contract();
    const candidates = this.queryable();
    if (!c || !candidates.length) return;
    const data: QueryDialogData = {
      vendor: this.vendor(), contract: c.reference, contractName: c.name, period: this.store.period(), to: this.vendorContact(),
      tolerancePct: this.store.payableRules().deviationPct, lines: candidates.map((l) => this.queryLine(l)), selected: onlyKey ? [onlyKey] : candidates.map((l) => l.key),
    };
    const v: QueryDialogResult | undefined = await this.dialog.open(VendorQueryDialogComponent, { data, panelClass: 'app-dialog-panel', autoFocus: false, ...DIALOG_SIZE.wide }).afterClosed().toPromise();
    if (!v) return;
    this.store.queryVendor({ vendor: this.vendor(), contract: c.reference, period: this.store.period(), lines: this.details(v.keys), to: v.to, subject: v.subject, comment: v.comment });
    this.ui.toast(`Email sent to ${v.to}.`);
  }
}
