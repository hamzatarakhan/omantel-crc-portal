import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { VendorDetailDialogComponent } from '../../../shared/components/vendor-detail-dialog/vendor-detail-dialog.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { ContractOps } from '../../../core/services/contract-ops.service';
import { UiService } from '../../../shared/services/ui.service';
import { Contract, ContractAttachment, ContractRecord, PurchaseOrder } from '../../../core/models/domain';
import { daysRemainingToLevel } from '../../../core/models/status';
import { addDays, attachmentsFor, purchaseOrdersFor, ruleApplies, timelineFor, yearlyBudgetFor } from '../../../core/services/contract-data';
import { PO_LEVEL, PoDetailDialogComponent } from './po-detail-dialog.component';
import { ACTION_STATUSES, ACTION_TYPES, ESCALATION_STATUSES, EscalationStatus, MonitoringAction, remainingLabel, statusLevelFor } from '../../../core/services/contract-monitoring';
import { RequiresDirective } from '../../../shared/directives/requires.directive';
import { DIALOG_SIZE } from '../../../shared/dialog-sizes';
import { RecordDetailDialogComponent } from './record-detail-dialog.component';

const kb = (n: number) => (n >= 1024 ? (n / 1024).toFixed(1) + ' MB' : n + ' KB');
const TABS = ['summary', 'yearly-budget', 'records', 'attachments', 'alerts', 'actions', 'sync', 'audit'];
const today = () => new Date().toISOString().slice(0, 10);

@Component({
  selector: 'app-contract-detail',
  standalone: true,
  imports: [RequiresDirective, CommonModule, RouterModule, MatTabsModule, MatButtonModule, MatIconModule, PageHeaderComponent, StatusChipComponent, DataTableComponent],
  template: `
    @if (contract(); as c) {
     @if (!store.can('View Contract Details')) {
      <div class="surface-card p-8 text-center text-sm text-ink-500">Your role ({{ store.currentRole() }}) does not have the "View Contract Details" permission. <a class="text-brand-600 font-medium" routerLink="/contracts-budget/contracts">Back to the contract list</a></div>
     } @else {
      <app-page-header
        [title]="c.name"
        [subtitle]="'Reference ' + c.reference + ' · ERP ' + c.erpReference + ' · Source: ERP (read-only)'"
        [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Contract List', link: '/contracts-budget/contracts' }, { label: c.reference }]"
      >
        <app-status-chip [label]="c.status" [level]="level(c)"></app-status-chip>
        @if (c.renewalStatus === 'Renewed') { <app-status-chip label="Renewed" level="info"></app-status-chip> }
        <button mat-flat-button color="primary" (click)="sync(c)" appRequires="Manual Contract Sync" [disabled]="phase() === 'initiated' || phase() === 'progress'">
          <mat-icon class="!text-base !mr-1" [class.animate-spin]="phase() === 'initiated' || phase() === 'progress'">sync</mat-icon>
          {{ phase() === 'initiated' || phase() === 'progress' ? 'Syncing…' : 'Sync from ERP' }}
        </button>
      </app-page-header>

      @if (phase() !== 'idle') {
        <div class="surface-card px-4 py-3 mb-4 flex items-center gap-3 flex-wrap">
          <ol class="flex items-center gap-2 text-xs font-semibold list-none p-0 m-0">
            @for (s of steps; track s.key) {
              <li class="flex items-center gap-1.5" [class]="stepState(s.key) === 'todo' ? 'text-ink-300' : stepState(s.key) === 'active' ? 'text-brand-700' : 'text-ink-700'">
                <mat-icon class="!text-base !w-4 !h-4 !leading-4">{{ stepState(s.key) === 'done' ? 'check_circle' : stepState(s.key) === 'active' ? 'autorenew' : 'radio_button_unchecked' }}</mat-icon>{{ s.label }}
                @if (!$last) { <span class="text-ink-300 mx-1">›</span> }
              </li>
            }
          </ol>
          @if (phase() === 'done') {
            <span class="status-chip" [class]="'status-chip--' + (outcome() === 'failed' ? 'red' : outcome() === 'completed' ? 'info' : 'normal')">{{ outcome() === 'failed' ? 'Synchronization failed' : outcome() === 'completed' ? 'Completed successfully' : 'No changes found' }}</span>
            <span class="text-xs text-ink-500 flex-1 min-w-[220px]">{{ syncMessage() }}</span>
            @if (outcome() === 'failed') { <button mat-stroked-button (click)="sync(c)" appRequires="Manual Contract Sync"><mat-icon class="!text-base !mr-1">replay</mat-icon>Retry</button> }
          }
        </div>
      }

      @if (c.status === 'Cancelled') {
        <div class="surface-card px-4 py-3 mb-4 flex items-center gap-3 border-l-4 !border-l-status-neutral"><mat-icon class="text-status-neutral">inventory_2</mat-icon><div class="text-sm text-ink-700"><b>Cancelled in the ERP.</b> This contract is removed from the active screens and kept only for historical reporting.</div></div>
      }
      @for (i of issues(); track i.code) {
        <div class="surface-card px-4 py-3 mb-4 flex items-start gap-3 border-l-4 !border-l-status-amber"><mat-icon class="text-status-amber">flag</mat-icon><div class="text-sm text-ink-700"><b>Flagged for review ({{ i.code }}).</b> {{ i.message }}</div></div>
      }

      <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Vendor</div><div class="text-sm font-medium text-ink-900 mt-0.5">{{ c.vendorName }}</div></div>
        <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Contract Amount</div><div class="text-sm font-medium text-ink-900 mt-0.5">{{ c.amount | number:'1.0-2' }} {{ c.currency }}</div></div>
        <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Start &rarr; End Date</div><div class="text-sm font-medium text-ink-900 mt-0.5">{{ c.startDate }} &rarr; {{ c.endDate }}</div></div>
        <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Days Remaining</div><div class="text-sm font-medium mt-0.5" [class]="c.daysRemaining < 0 ? 'text-status-red' : 'text-ink-900'" [title]="c.daysRemaining + ' days'">{{ remaining(c) }}</div></div>
        <div class="surface-card px-4 py-3 col-span-2 md:col-span-1"><div class="text-xs text-ink-400">Required action</div><div class="text-sm font-medium text-ink-900 mt-0.5">{{ ops.requiredAction(c) }}</div></div>
      </div>

      <mat-tab-group [selectedIndex]="selected()" (selectedIndexChange)="selected.set($event)">
        <!-- ============ Summary ============ -->
        <mat-tab label="Summary">
          <div class="pt-4 grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
            <div class="xl:col-span-2 flex flex-col gap-4">
              <div class="surface-card px-4 pt-3.5 pb-4 sm:px-5">
                <h3 class="text-[13.5px] font-bold text-ink-900">Contract information</h3>
                <p class="text-sm text-ink-700 mt-2 leading-relaxed">{{ c.description }}</p>
                <div class="text-[11px] font-bold uppercase tracking-wide text-ink-400 mt-4 mb-1.5">Scope of work</div>
                <ul class="text-sm text-ink-700 list-disc pl-5 space-y-1">@for (s of c.scope; track s) { <li>{{ s }}</li> }</ul>
                <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mt-5 pt-4 border-t border-surface-border text-sm">
                  <div><dt class="text-xs text-ink-400">Contract reference</dt><dd class="font-medium text-ink-900">{{ c.reference }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Contract type</dt><dd class="font-medium text-ink-900">{{ c.contractType }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Record type</dt><dd class="font-medium text-ink-900">{{ c.recordType }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Parent contract</dt><dd class="font-medium text-ink-900">{{ c.parentReference || '— (this is a parent contract)' }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Owning department</dt><dd class="font-medium text-ink-900">{{ c.department }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Contract manager</dt><dd class="font-medium text-ink-900">{{ c.contractManager }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Payment terms</dt><dd class="font-medium text-ink-900">{{ c.paymentTerms }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Signed on</dt><dd class="font-medium text-ink-900">{{ c.signedDate }}</dd></div>
                  <div class="sm:col-span-2"><dt class="text-xs text-ink-400">Signatories</dt><dd class="font-medium text-ink-900">{{ c.signatory }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Renewal option</dt><dd class="font-medium text-ink-900">{{ c.renewalOption }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Renewal status</dt><dd class="font-medium text-ink-900">{{ c.renewalStatus || 'No renewal started' }}</dd></div>
                </dl>
              </div>

              <div class="surface-card px-4 pt-3.5 pb-4 sm:px-5">
                <h3 class="text-[13.5px] font-bold text-ink-900">Financial summary</h3>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
                  <div><div class="text-xs text-ink-400">Contract value</div><div class="text-base font-extrabold text-ink-900">{{ c.amount | number:'1.0-0' }} <span class="text-xs font-medium text-ink-400">{{ c.currency }}</span></div></div>
                  <div><div class="text-xs text-ink-400">PO value</div><div class="text-base font-extrabold text-ink-900">{{ poTotal() | number:'1.0-0' }} <span class="text-xs font-medium text-ink-400">{{ c.currency }}</span></div></div>
                  <div><div class="text-xs text-ink-400">Variation Order lines</div><div class="text-base font-extrabold text-ink-900">{{ count('Variation Order') }}</div></div>
                  <div><div class="text-xs text-ink-400">Amendments</div><div class="text-base font-extrabold text-ink-900">{{ amendmentValue() | number:'1.0-0' }} <span class="text-xs font-medium text-ink-400">{{ c.currency }}</span></div></div>
                </div>
                <div class="text-xs text-ink-400 mt-3">PO value is this contract's one purchase order: the contract amount plus amendments. Amounts per variation order line will be read from the ERP later and show as "—" until then.</div>
              </div>

              @if (po(); as p) {
                <div class="surface-card px-4 pt-3.5 pb-4 sm:px-5">
                  <div class="flex items-center justify-between gap-3 flex-wrap">
                    <h3 class="text-[13.5px] font-bold text-ink-900">Purchase order</h3>
                    <app-status-chip [label]="p.status" [level]="poLevel(p)"></app-status-chip>
                  </div>
                  <dl class="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 mt-3 text-sm">
                    <div><dt class="text-xs text-ink-400">PO number</dt><dd class="font-medium text-ink-900">{{ p.poNumber || '—' }}</dd></div>
                    <div><dt class="text-xs text-ink-400">PO type</dt><dd class="font-medium text-ink-900">{{ p.poType }}</dd></div>
                    <div><dt class="text-xs text-ink-400">PO date</dt><dd class="font-medium text-ink-900">{{ p.poDate }}</dd></div>
                    <div><dt class="text-xs text-ink-400">ERP reference</dt><dd class="font-medium text-ink-900">{{ p.erpReference }}</dd></div>
                  </dl>
                  <button mat-stroked-button class="mt-3.5" (click)="openPo(p)"><mat-icon class="!text-base !mr-1">request_quote</mat-icon>View purchase order details</button>
                </div>
              }

              <div class="surface-card px-4 pt-3.5 pb-4 sm:px-5">
                <div class="flex items-center justify-between gap-3 flex-wrap">
                  <h3 class="text-[13.5px] font-bold text-ink-900">Vendor information</h3>
                  <button mat-stroked-button (click)="openVendor(c)"><mat-icon class="!text-base !mr-1">store</mat-icon>View all {{ vendorContracts().length }} contract{{ vendorContracts().length === 1 ? '' : 's' }} of this vendor</button>
                </div>
                <dl class="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 mt-3 text-sm">
                  <div><dt class="text-xs text-ink-400">Vendor</dt><dd class="font-medium text-ink-900">{{ c.vendorName }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Vendor reference (ERP)</dt><dd class="font-medium text-ink-900">{{ c.erpVendorId }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Contracts with Omantel</dt><dd class="font-medium text-ink-900">{{ vendorContracts().length }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Total contract value</dt><dd class="font-medium text-ink-900">{{ vendorValue() | number:'1.0-0' }} {{ c.currency }}</dd></div>
                </dl>
              </div>
            </div>

            <div class="flex flex-col gap-4">
              <div class="surface-card px-4 pt-3.5 pb-4">
                <h3 class="text-[13.5px] font-bold text-ink-900">ERP record</h3>
                <dl class="grid grid-cols-1 gap-y-3 mt-3 text-sm">
                  <div><dt class="text-xs text-ink-400">Source system</dt><dd class="font-medium text-ink-900">ERP · read-only in CRC</dd></div>
                  <div><dt class="text-xs text-ink-400">ERP reference</dt><dd class="font-medium text-ink-900">{{ c.erpReference }}</dd></div>
                  <div><dt class="text-xs text-ink-400">ERP vendor ID</dt><dd class="font-medium text-ink-900">{{ c.erpVendorId }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Purchase order</dt><dd class="font-medium text-ink-900">{{ poNumbers() }}</dd></div>
                  <div><dt class="text-xs text-ink-400">ERP status</dt><dd class="font-medium text-ink-900">{{ c.erpStatus }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Created in ERP</dt><dd class="font-medium text-ink-900">{{ c.erpCreatedAt }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Last modified in ERP</dt><dd class="font-medium text-ink-900">{{ c.erpModifiedAt }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Linked records &middot; attachments</dt><dd class="font-medium text-ink-900">{{ children().length }} &middot; {{ attachments().length }}</dd></div>
                </dl>
              </div>
              <div class="surface-card px-4 pt-3.5 pb-4">
                <h3 class="text-[13.5px] font-bold text-ink-900">Synchronization status</h3>
                <dl class="grid grid-cols-1 gap-y-3 mt-3 text-sm">
                  <div><dt class="text-xs text-ink-400">Last successful synchronization</dt><dd class="font-medium text-ink-900">{{ info().lastSuccessAt | date:'medium' }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Last synchronization</dt><dd class="font-medium text-ink-900">{{ info().lastAttemptAt | date:'medium' }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Last synchronization status</dt><dd class="font-medium" [class]="info().error ? 'text-status-red' : 'text-ink-900'">{{ info().lastStatus }} ({{ info().type }})</dd></div>
                  <div><dt class="text-xs text-ink-400">Last initiated by</dt><dd class="font-medium text-ink-900">{{ info().initiatedBy }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Last error</dt><dd class="font-medium text-ink-900">{{ info().error || 'None' }}</dd></div>
                  <div><dt class="text-xs text-ink-400">ERP record reference</dt><dd class="font-medium text-ink-900">{{ c.erpReference }}</dd></div>
                </dl>
              </div>
              <div class="surface-card px-4 pt-3.5 pb-4">
                <h3 class="text-[13.5px] font-bold text-ink-900">Key dates</h3>
                <dl class="grid grid-cols-1 gap-y-3 mt-3 text-sm">
                  <div><dt class="text-xs text-ink-400">Start</dt><dd class="font-medium text-ink-900">{{ c.startDate }}</dd></div>
                  <div><dt class="text-xs text-ink-400">End</dt><dd class="font-medium text-ink-900">{{ c.endDate }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Next expiry alert</dt><dd class="font-medium text-ink-900">{{ nextAlert() || 'None scheduled' }}</dd></div>
                  <div><dt class="text-xs text-ink-400">{{ ops.escalationRule().hours }}-hour escalation</dt><dd class="font-medium text-ink-900">{{ escalationDate() }}</dd></div>
                </dl>
              </div>
              <p class="text-xs text-ink-400 leading-relaxed">All fields are synced read-only from the ERP. To correct a value, update it in the ERP; it appears here after the next synchronization. CRC does not perform actions on other systems.</p>
            </div>
          </div>
        </mat-tab>

        <!-- ============ Yearly Budget ============ -->
        <mat-tab [label]="'Yearly Budget (' + yearlyBudget().length + ')'">
          <div class="pt-4 flex flex-col gap-4">
            <app-data-table title="Yearly budgets" [columns]="yearlyColumns()" [rows]="yearlyBudget()" [pageSize]="10" [exportable]="store.can('Export Contract Data')" [selectedRow]="pickedYear()" (rowClick)="pickYear($event)" emptyTitle="No yearly budgets"></app-data-table>
            @if (pickedYear(); as y) {
              <app-data-table [title]="'Lines of ' + y.description" [columns]="lineColumns()" [rows]="y.lines" [pageSize]="20" [exportable]="store.can('Export Contract Data')" emptyTitle="No budget lines"></app-data-table>
            } @else {
              <div class="surface-card px-4 py-6 text-center text-sm text-ink-500">Select a yearly budget above to see its lines.</div>
            }
            <p class="text-xs text-ink-400">One row per contract year, adding up to the contract amount of {{ c.amount | number:'1.0-2' }} {{ c.currency }}. A contract of one year or less has a single row with the contract's own start and end date. Each year's lines are the lines of the contract's PO. Allocations are not read from the ERP yet: years are split by days and lines evenly.</p>
          </div>
        </mat-tab>

        <!-- ============ Variation Orders ============ -->
        <mat-tab [label]="'Variation Orders (' + children().length + ')'">
          <div class="pt-4">
            <div class="surface-card px-4 py-3 mb-4 flex items-center gap-2 flex-wrap text-sm">
              <button class="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:underline" (click)="openVendor(c)"><mat-icon class="!text-lg">store</mat-icon>{{ c.vendorName }}</button>
              <mat-icon class="!text-lg text-ink-300">chevron_right</mat-icon>
              <span class="font-semibold text-ink-900">{{ c.reference }} (parent contract)</span>
              <mat-icon class="!text-lg text-ink-300">chevron_right</mat-icon>
              <span class="text-ink-500">PO {{ poNumbers() }} · {{ count('Variation Order') }} variation order{{ count('Variation Order') === 1 ? '' : 's' }} · {{ count('Amendment') }} amendment{{ count('Amendment') === 1 ? '' : 's' }} · {{ count('Time Extension') }} time extension{{ count('Time Extension') === 1 ? '' : 's' }}</span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div class="surface-card px-4 py-3"><div class="text-[11px] font-bold text-ink-400 uppercase tracking-wide">PO value</div><div class="text-lg font-extrabold text-ink-900">{{ poTotal() | number:'1.0-0' }}</div></div>
              <div class="surface-card px-4 py-3"><div class="text-[11px] font-bold text-ink-400 uppercase tracking-wide">Variation Orders</div><div class="text-lg font-extrabold text-ink-900">{{ count('Variation Order') }}</div></div>
              <div class="surface-card px-4 py-3"><div class="text-[11px] font-bold text-ink-400 uppercase tracking-wide">Amendments</div><div class="text-lg font-extrabold text-ink-900">{{ count('Amendment') }}</div></div>
              <div class="surface-card px-4 py-3"><div class="text-[11px] font-bold text-ink-400 uppercase tracking-wide">Time extensions</div><div class="text-lg font-extrabold text-ink-900">{{ count('Time Extension') }}</div></div>
            </div>
            <app-data-table title="Changes made to this contract" [columns]="childColumns" [rows]="children()" [pageSize]="10" [exportable]="store.can('Export Contract Data')" (rowClick)="openRecord($event)" emptyTitle="No changes yet" emptyDescription="Variation orders, amendments and time extensions made to this contract appear here."></app-data-table>
            <p class="text-xs text-ink-400 mt-3">Click a row to see the change, the contract it applies to and its documents. Everything here is read from the ERP; CRC does not change it or perform actions on other systems.</p>
          </div>
        </mat-tab>

        <!-- ============ Attachments ============ -->
        <mat-tab [label]="'Attachments (' + attachments().length + ')'">
          <div class="pt-4">
            @if (!store.can('View Attachments')) {
              <div class="surface-card p-8 text-center text-sm text-ink-500"><mat-icon class="text-ink-300 !text-4xl !w-10 !h-10">lock</mat-icon><div class="mt-2">Your role ({{ store.currentRole() }}) does not have the "View Attachments" permission.</div></div>
            } @else {
              <app-data-table title="Documents held in the ERP" [columns]="attachmentColumns" [rows]="attachmentRows()" [pageSize]="10" [exportable]="store.can('Export Contract Data')" (rowAction)="attachmentAction($event)"></app-data-table>
              <p class="text-xs text-ink-400 mt-3">Documents are stored in the ERP and are view-only here: no upload, replace or delete. New or updated files arrive with the next synchronization. The prototype generates a sample PDF for each.</p>
            }
          </div>
        </mat-tab>

        <!-- ============ Notifications & Escalations ============ -->
        <mat-tab label="Notifications & Escalations">
          <div class="pt-4 flex flex-col gap-4">
            <div class="surface-card px-4 py-3.5 flex items-center gap-3 flex-wrap">
              <span class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" [class]="esc().tone"><mat-icon class="!text-[19px]">{{ esc().icon }}</mat-icon></span>
              <div class="flex-1 min-w-[220px]">
                <div class="text-sm font-semibold text-ink-900 flex items-center gap-2">{{ ops.escalationRule().hours }}-hour escalation <app-status-chip [label]="escalationStatus()" [level]="esc().level"></app-status-chip></div>
                <div class="text-xs text-ink-500 mt-0.5">{{ esc().text }}</div>
              </div>
              <button mat-stroked-button (click)="updateEscalation(c)" appRequires="Manage Escalations"><mat-icon class="!text-base !mr-1">edit_note</mat-icon>Update status</button>
              <button mat-flat-button color="primary" (click)="recordResolution(c)" appRequires="Manage Escalations"><mat-icon class="!text-base !mr-1">task_alt</mat-icon>Record resolution</button>
            </div>

            <app-data-table title="Escalation history" [columns]="escalationColumns" [rows]="escalationRows()" [exportable]="false" emptyTitle="No escalation yet" emptyDescription="An escalation is recorded when the contract is still unresolved at the configured threshold, or when someone updates the status."></app-data-table>
            <app-data-table [title]="'Alert schedule (' + ops.syncConfig().timezone + ')'" [columns]="alertColumns" [rows]="alerts()" [exportable]="false" emptyTitle="No alert rules apply" emptyDescription="Create a rule under Notification Config."></app-data-table>
            <app-data-table title="Notification delivery log" [columns]="deliveryColumns" [rows]="deliveryRows()" [exportable]="store.can('Export Contract Data')" emptyTitle="Nothing sent yet" emptyDescription="Alerts appear here once their date has passed."></app-data-table>
            <p class="text-xs text-ink-400">Rules, templates and the escalation threshold are managed on <a class="text-brand-600 font-medium" routerLink="/contracts-budget/notifications">Notification Config</a>. Each rule sends one alert per contract, so duplicates are never produced.</p>
          </div>
        </mat-tab>

        <!-- ============ Monitoring actions ============ -->
        <mat-tab [label]="'Monitoring Actions (' + actions().length + ')'">
          <div class="pt-4 flex flex-col gap-3">
            <div class="flex items-center justify-between gap-3 flex-wrap">
              <p class="text-xs text-ink-500 max-w-2xl">Follow-up actions are recorded here without changing the contract. Renewals, extensions and amendments themselves are carried out in the ERP — put the ERP transaction reference on the action.</p>
              <button mat-flat-button color="primary" (click)="actionForm(c)" appRequires="Manage Monitoring Actions"><mat-icon class="!text-base !mr-1">add</mat-icon>New action</button>
            </div>
            <app-data-table title="Actions on this contract" [columns]="actionColumns" [rows]="actions()" [pageSize]="10" [exportable]="store.can('Export Contract Data')" (rowAction)="actionRowAction($event, c)" emptyTitle="No actions recorded" emptyDescription="Record a review, a renewal request or a follow-up to track who is doing what."></app-data-table>
          </div>
        </mat-tab>

        <!-- ============ Synchronization history ============ -->
        <mat-tab label="Synchronization History">
          <div class="pt-4 flex flex-col gap-4">
            @if (!store.can('View Sync History')) {
              <div class="surface-card p-8 text-center text-sm text-ink-500"><mat-icon class="text-ink-300 !text-4xl !w-10 !h-10">lock</mat-icon><div class="mt-2">Your role ({{ store.currentRole() }}) does not have the "View Sync History" permission.</div></div>
            } @else {
              <app-data-table title="Synchronization runs that included this contract" [columns]="syncColumns" [rows]="syncRows()" [pageSize]="8" [exportable]="store.can('Export Contract Data')" emptyTitle="No synchronization yet"></app-data-table>
              <app-data-table title="Field changes received from the ERP" [columns]="changeColumns" [rows]="changeRows()" [pageSize]="8" [exportable]="store.can('Export Contract Data')" emptyTitle="No field changes" emptyDescription="When a synchronization brings a new value, the previous value, the new value and the time are kept here."></app-data-table>
              <p class="text-xs text-ink-400">A manual synchronization refreshes this contract, its linked records and their documents, and never changes the automated schedule. If it fails, the last valid data is kept.</p>
            }
          </div>
        </mat-tab>

        <!-- ============ Audit history ============ -->
        <mat-tab [label]="'Audit History (' + auditRows().length + ')'">
          <div class="pt-4">
            @if (!store.can('View Audit History')) {
              <div class="surface-card p-8 text-center text-sm text-ink-500"><mat-icon class="text-ink-300 !text-4xl !w-10 !h-10">lock</mat-icon><div class="mt-2">Your role ({{ store.currentRole() }}) does not have the "View Audit History" permission.</div></div>
            } @else {
              <app-data-table title="Everything that happened to this contract" [columns]="auditColumns" [rows]="auditRows()" [pageSize]="10" [exportable]="store.can('Export Contract Data')"></app-data-table>
              <p class="text-xs text-ink-400 mt-3">The audit trail is read-only.</p>
            }
          </div>
        </mat-tab>
      </mat-tab-group>
     }
    } @else {
      <div class="surface-card p-8 text-center text-sm text-ink-500">This contract could not be found, or it is outside your data scope. <a class="text-brand-600 font-medium" routerLink="/contracts-budget/contracts">Back to the contract list</a></div>
    }
  `,
})
export class ContractDetailComponent {
  store = inject(CrcStore);
  ops = inject(ContractOps);
  private ui = inject(UiService);
  private dialog = inject(MatDialog);
  private route = inject(ActivatedRoute);
  private id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id'))));
  private tabParam = toSignal(this.route.queryParamMap.pipe(map((p) => p.get('tab'))));

  selected = signal(0);
  phase = signal<'idle' | 'initiated' | 'progress' | 'done'>('idle');
  outcome = signal<'completed' | 'no-changes' | 'failed'>('no-changes');
  syncMessage = signal('');
  steps = [{ key: 'initiated', label: 'Synchronization initiated' }, { key: 'progress', label: 'In progress' }, { key: 'done', label: 'Result' }];

  constructor() {
    effect(() => {
      const i = TABS.indexOf(this.tabParam() ?? '');
      if (i >= 0) this.selected.set(i);
    }, { allowSignalWrites: true });
  }

  contract = computed(() => this.ops.scoped().find((c) => c.id === this.id()));
  children = computed<ContractRecord[]>(() => { const c = this.contract(); return c ? this.ops.childrenOf(c) : []; });
  attachments = computed<ContractAttachment[]>(() => { const c = this.contract(); return c ? attachmentsFor(c, this.children()) : []; });
  pos = computed<PurchaseOrder[]>(() => { const c = this.contract(); return c ? purchaseOrdersFor(c, this.children()) : []; });
  po = computed(() => this.pos()[0] ?? null);
  poNumbers = computed(() => { const p = this.pos(); return p.length ? p.map((x) => x.poNumber).join(', ') : '—'; });
  poTotal = computed(() => this.pos().reduce((s, p) => s + (p.amount ?? 0), 0));
  poLevel(p: PurchaseOrder) { return PO_LEVEL[p.status] ?? 'neutral'; }
  attachmentRows = computed(() => this.attachments().map((a) => ({ ...a, size: kb(a.sizeKb) })));
  issues = computed(() => { const c = this.contract(); return c ? this.ops.issuesFor(c) : []; });
  info = computed(() => { const c = this.contract(); return c ? this.ops.syncInfo(c) : { lastSuccessAt: '', lastAttemptAt: '', lastStatus: '', initiatedBy: '', type: '', error: '', failed: false }; });
  vendorContracts = computed(() => { const c = this.contract(); return c ? this.ops.active().filter((x) => x.vendorName === c.vendorName) : []; });
  vendorValue = computed(() => this.vendorContracts().reduce((s, x) => s + x.amount, 0));
  timeline = computed(() => {
    const c = this.contract();
    const r = this.ops.escalationRule();
    return c ? timelineFor(c, this.children(), this.attachments(), this.store.notificationRules(), { hours: r.hours, applies: r.appliesTo.length === 0 || r.appliesTo.includes(c.contractType) }) : [];
  });

  amendmentValue = computed(() => this.children().filter((r) => r.recordType === 'Amendment').reduce((s, r) => s + (r.amount ?? 0), 0));

  alerts = computed(() => {
    const c = this.contract();
    if (!c || c.status === 'Cancelled') return [];
    const now = today();
    return this.store.notificationRules()
      .filter((r) => ruleApplies(r, c))
      .map((r) => {
        const date = addDays(c.endDate, -r.thresholdDays);
        const tpl = this.ops.templates().find((t) => t.id === r.templateId);
        return { days: r.thresholdDays, alertDate: date, channel: r.channel, recipients: r.recipients, template: tpl ? `${tpl.name} (${tpl.language})` : '—', state: date <= now ? 'Sent' : 'Scheduled' };
      })
      .sort((a, b) => b.days - a.days);
  });
  nextAlert = computed(() => this.alerts().filter((a) => a.state === 'Scheduled').map((a) => a.alertDate).sort()[0]);
  escalationDate = computed(() => { const c = this.contract(); return c ? this.ops.escalationDate(c) : ''; });
  escalationStatus = computed<EscalationStatus>(() => { const c = this.contract(); return c ? this.ops.escalationStatus(c) : 'Not required'; });

  esc = computed(() => {
    const c = this.contract();
    const status = this.escalationStatus();
    const rule = this.ops.escalationRule();
    const date = this.escalationDate();
    const events = c ? this.ops.escalationHistory(c) : [];
    const last = events[events.length - 1];
    const map: Record<EscalationStatus, { icon: string; tone: string; level: 'normal' | 'amber' | 'orange' | 'red' | 'info' | 'neutral'; text: string }> = {
      'Not required': { icon: 'schedule', tone: 'bg-brand-50 text-brand-600', level: 'neutral', text: c && this.ops.escalationRule().appliesTo.length && !this.ops.escalationRule().appliesTo.includes(c.contractType) ? `The escalation rule does not apply to ${c.contractType} contracts.` : `Triggers ${rule.hours} hours before expiry (${date}) if the contract has not been renewed or closed.` },
      'Pending action': { icon: 'hourglass_top', tone: 'bg-amber-50 text-status-amber', level: 'amber', text: `Expiring soon and not resolved. It escalates to ${rule.recipients} on ${date}.` },
      'Action in progress': { icon: 'autorenew', tone: 'bg-amber-50 text-status-amber', level: 'amber', text: last ? `Action in progress — ${last.comments}` : 'Someone is working on the renewal or extension.' },
      Escalated: { icon: 'priority_high', tone: 'bg-red-50 text-status-red', level: 'red', text: `Escalated to ${rule.recipients}${last ? ' on ' + last.at.slice(0, 10) : ''}. It stays unresolved until someone records a resolution.` },
      Resolved: { icon: 'task_alt', tone: 'bg-emerald-50 text-status-normal', level: 'normal', text: c?.renewalStatus === 'Renewed' ? 'The contract was renewed in the ERP.' : `Resolved${last?.resolutionDate ? ' on ' + last.resolutionDate : ''}${last?.comments ? ' — ' + last.comments : ''}.` },
      Closed: { icon: 'inventory_2', tone: 'bg-slate-100 text-status-neutral', level: 'neutral', text: c?.status === 'Cancelled' ? 'Closed — the contract was cancelled in the ERP.' : `Closed${last?.comments ? ' — ' + last.comments : ''}.` },
    };
    return map[status];
  });

  escalationRows = computed(() => { const c = this.contract(); return c ? this.ops.escalationHistory(c).map((e) => ({ ...e, contract: c.reference })).reverse() : []; });
  actions = computed(() => { const c = this.contract(); return c ? this.ops.actions().filter((a) => a.contractId === c.id) : []; });
  deliveryRows = computed(() => this.timeline().filter((e) => e.kind === 'notice' || e.kind === 'alert' || e.kind === 'escalation').map((e) => ({ when: e.at, type: e.title, channel: e.channel ?? '', recipients: e.recipients ?? '', delivery: e.result === 'Success' ? 'Delivered' : 'Failed', details: e.details })));
  syncRows = computed(() => { const c = this.contract(); return c ? this.store.syncRuns().filter((r) => !r.contractReference || r.contractReference === c.reference).map((r) => ({ ...r, scope: r.contractReference ? 'This contract' : 'All contracts', error: r.errorMessage ?? '' })) : []; });
  changeRows = computed(() => { const c = this.contract(); return c ? this.ops.changes().filter((x) => x.contractId === c.id) : []; });
  auditRows = computed(() => { const c = this.contract(); return c ? this.store.audit().filter((a) => a.reference === c.reference) : []; });

  yearlyBudget = computed(() => { const c = this.contract(); return c ? yearlyBudgetFor(c, this.children()) : []; });
  private allocatedCol = (): TableColumn<any> => ({ key: 'allocated', label: 'Allocated budget', type: 'currency', currency: this.contract()?.currency, align: 'right' });
  yearlyColumns = computed<TableColumn<any>[]>(() => [
    { key: 'description', label: 'Yearly budget' },
    { key: 'startDate', label: 'Start date', type: 'date' },
    { key: 'endDate', label: 'End date', type: 'date' },
    this.allocatedCol(),
  ]);
  lineColumns = computed<TableColumn<any>[]>(() => [
    { key: 'line', label: 'Line', type: 'number' },
    { key: 'description', label: 'Line description' },
    { key: 'scope', label: 'Line scope' },
    this.allocatedCol(),
  ]);
  pickedYearNo = signal<number | null>(null);
  pickedYear = computed(() => this.yearlyBudget().find((y) => y.year === this.pickedYearNo()) ?? null);
  pickYear(y: { year: number }) { this.pickedYearNo.set(y.year); }

  childColumns: TableColumn<any>[] = [
    { key: 'reference', label: 'Change reference' },
    { key: 'recordType', label: 'Change type' },
    { key: 'description', label: 'Description of change' },
    { key: 'issuedDate', label: 'Issued on', type: 'date' },
    { key: 'startDate', label: 'Effective from', type: 'date' },
    { key: 'endDate', label: 'Effective to', type: 'date' },
    { key: 'amount', label: 'Value change', type: 'currency', align: 'right' },
    { key: 'poNumber', label: 'PO number' },
    { key: 'erpReference', label: 'ERP reference' },
    { key: 'attachments', label: 'Documents', type: 'number', align: 'right' },
    { key: 'status', label: 'Status', type: 'status', statusFn: (r) => ({ label: r.status, level: r.status === 'Closed' ? 'neutral' : r.status === 'Expiring Soon' ? daysRemainingToLevel(r.daysRemaining) : 'normal' }) },
  ];

  attachmentColumns: TableColumn<any>[] = [
    { key: 'name', label: 'File name' },
    { key: 'type', label: 'File type' },
    { key: 'category', label: 'Document category' },
    { key: 'version', label: 'Version' },
    { key: 'linkedTo', label: 'Linked to' },
    { key: 'erpAttachmentId', label: 'ERP attachment ID' },
    { key: 'erpDocumentRef', label: 'Related ERP reference' },
    { key: 'size', label: 'File size', align: 'right' },
    { key: 'source', label: 'Source system' },
    { key: 'uploadedBy', label: 'Uploaded by' },
    { key: 'uploadedAt', label: 'Upload date', type: 'date' },
    { key: 'syncedAt', label: 'Synced', type: 'date' },
    { key: 'open', label: 'Open', actions: [{ id: 'view', label: 'View', icon: 'visibility' }, { id: 'download', label: 'Download', icon: 'download' }] },
  ];

  escalationColumns: TableColumn<any>[] = [
    { key: 'contract', label: 'Contract' },
    { key: 'at', label: 'Escalation date & time', type: 'date' },
    { key: 'reason', label: 'Reason' },
    { key: 'recipients', label: 'Escalated recipients' },
    { key: 'status', label: 'Resolution status', type: 'status', statusFn: (r) => ({ label: r.status, level: r.status === 'Escalated' ? 'red' : r.status === 'Resolved' ? 'normal' : r.status === 'Closed' ? 'neutral' : 'amber' }) },
    { key: 'resolutionDate', label: 'Resolution date' },
    { key: 'comments', label: 'Resolution comments' },
    { key: 'responsibleUser', label: 'Responsible user' },
    { key: 'supportingRef', label: 'Supporting reference' },
    { key: 'erpUpdateRef', label: 'ERP update reference' },
    { key: 'by', label: 'Recorded by' },
  ];

  alertColumns: TableColumn<any>[] = [
    { key: 'days', label: 'Days before expiry', type: 'number', align: 'right' },
    { key: 'alertDate', label: 'Alert date', type: 'date' },
    { key: 'channel', label: 'Channel' },
    { key: 'recipients', label: 'Recipients' },
    { key: 'template', label: 'Template' },
    { key: 'state', label: 'State', type: 'status', statusFn: (r) => ({ label: r.state, level: r.state === 'Sent' ? 'normal' : 'info' }) },
  ];

  deliveryColumns: TableColumn<any>[] = [
    { key: 'when', label: 'Sent', type: 'date' },
    { key: 'type', label: 'Notification' },
    { key: 'channel', label: 'Channel' },
    { key: 'recipients', label: 'Recipients' },
    { key: 'delivery', label: 'Delivery', type: 'status', statusFn: (r) => ({ label: r.delivery, level: r.delivery === 'Delivered' ? 'normal' : 'red' }) },
    { key: 'details', label: 'Details' },
  ];

  actionColumns: TableColumn<any>[] = [
    { key: 'type', label: 'Action type' },
    { key: 'owner', label: 'Action owner' },
    { key: 'dueDate', label: 'Due date', type: 'date' },
    { key: 'status', label: 'Action status', type: 'status', statusFn: (r) => ({ label: r.status, level: r.status === 'Open' ? 'amber' : r.status === 'In progress' ? 'info' : r.status === 'Completed' ? 'normal' : 'neutral' }) },
    { key: 'erpTransactionRef', label: 'ERP transaction' },
    { key: 'comments', label: 'Comments' },
    { key: 'completedDate', label: 'Completion date', type: 'date' },
    { key: 'createdBy', label: 'Created by' },
    { key: 'lastUpdatedBy', label: 'Last updated by' },
    { key: 'updatedAt', label: 'Last updated', type: 'date' },
    {
      key: 'do', label: 'Manage',
      actions: [
        { id: 'edit', label: 'Edit', icon: 'edit' },
        { id: 'complete', label: 'Complete', icon: 'check_circle', hide: (r) => r.status === 'Completed' || r.status === 'Closed' },
        { id: 'close', label: 'Close', icon: 'cancel', hide: (r) => r.status === 'Closed' },
      ],
    },
  ];

  syncColumns: TableColumn<any>[] = [
    { key: 'type', label: 'Synchronization type' },
    { key: 'scope', label: 'Scope' },
    { key: 'startedAt', label: 'Start', type: 'date' },
    { key: 'finishedAt', label: 'End', type: 'date' },
    { key: 'initiatedBy', label: 'Initiated by' },
    { key: 'processed', label: 'Retrieved', type: 'number', align: 'right' },
    { key: 'created', label: 'Created', type: 'number', align: 'right' },
    { key: 'updated', label: 'Updated', type: 'number', align: 'right' },
    { key: 'errors', label: 'Errors', type: 'number', align: 'right' },
    { key: 'status', label: 'Status', type: 'status', statusFn: (r) => ({ label: r.status, level: r.status === 'Failed' ? 'red' : r.status === 'No Changes' ? 'neutral' : 'normal' }) },
    { key: 'error', label: 'Error details' },
  ];

  changeColumns: TableColumn<any>[] = [
    { key: 'at', label: 'Received', type: 'date' },
    { key: 'field', label: 'Field changed' },
    { key: 'previous', label: 'Previous value' },
    { key: 'next', label: 'New value' },
    { key: 'source', label: 'Synchronization source' },
  ];

  auditColumns: TableColumn<any>[] = [
    { key: 'timestamp', label: 'Date & time', type: 'date' },
    { key: 'actor', label: 'User / process' },
    { key: 'activityType', label: 'Activity type' },
    { key: 'erpReference', label: 'ERP reference' },
    { key: 'syncType', label: 'Sync type' },
    { key: 'previousValue', label: 'Previous value' },
    { key: 'newValue', label: 'New value' },
    { key: 'result', label: 'Result', type: 'status', statusFn: (r) => ({ label: r.result, level: r.result === 'Success' ? 'normal' : 'red' }) },
    { key: 'details', label: 'Details' },
  ];

  level(c: Contract) {
    return statusLevelFor(c);
  }

  remaining(c: Contract) {
    return remainingLabel(c.endDate);
  }

  min(a: number, b: number) {
    return Math.min(a, b);
  }

  count(type: ContractRecord['recordType']) {
    return this.children().filter((r) => r.recordType === type).length;
  }

  stepState(key: string): 'todo' | 'active' | 'done' {
    const order = ['initiated', 'progress', 'done'];
    const cur = order.indexOf(this.phase());
    const i = order.indexOf(key);
    return i < cur || this.phase() === 'done' ? 'done' : i === cur ? 'active' : 'todo';
  }

  async sync(c: Contract) {
    if (!this.ui.requires('Manual Contract Sync')) return;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    this.syncMessage.set('');
    this.phase.set('initiated');
    await wait(500);
    this.phase.set('progress');
    await wait(900);
    const res = this.ops.syncContract(c.id);
    this.outcome.set(res.outcome);
    this.syncMessage.set(res.message);
    this.phase.set('done');
  }

  openVendor(c: Contract) {
    this.dialog.open(VendorDetailDialogComponent, { data: { vendorName: c.vendorName, contracts: this.vendorContracts() }, panelClass: 'app-dialog-panel', autoFocus: false, ...DIALOG_SIZE.wide });
  }

  openPo(row: PurchaseOrder) {
    const c = this.contract();
    if (!c) return;
    const refs = new Set(row.records.map((r) => r.reference));
    this.dialog.open(PoDetailDialogComponent, {
      data: { po: row, parent: c, attachments: this.attachments().filter((a) => refs.has(a.linkedTo)), canViewAttachments: this.store.can('View Attachments'), openAttachment: (a: ContractAttachment, mode: 'view' | 'download') => this.openAttachment(a, mode) },
      panelClass: 'app-dialog-panel', autoFocus: false, ...DIALOG_SIZE.wide,
    });
  }

  openRecord(r: ContractRecord) {
    const c = this.contract();
    if (!c) return;
    this.dialog.open(RecordDetailDialogComponent, {
      data: { record: r, parent: c, attachments: this.attachments().filter((a) => a.linkedTo === r.reference), canViewAttachments: this.store.can('View Attachments'), openAttachment: (a: ContractAttachment, mode: 'view' | 'download') => this.openAttachment(a, mode) },
      panelClass: 'app-dialog-panel', autoFocus: false, ...DIALOG_SIZE.form,
    });
  }

  attachmentAction(e: { row: any; id: string }) {
    if (!this.ui.requires('View Attachments')) return;
    this.openAttachment(e.row, e.id === 'view' ? 'view' : 'download');
  }

  openAttachment(row: ContractAttachment, mode: 'view' | 'download') {
    const c = this.contract();
    if (!c) return;
    this.ui.pdf(row.name, row.type, [
      `Contract: ${c.reference} - ${c.name}`,
      `Vendor: ${c.vendorName}`,
      `Linked to: ${row.linkedTo}`,
      `Category: ${row.category} (${row.version})`,
      '',
      `ERP attachment ID: ${row.erpAttachmentId}`,
      `ERP document reference: ${row.erpDocumentRef}`,
      `Source system: ${row.source}`,
      `Uploaded by ${row.uploadedBy} on ${row.uploadedAt}`,
      `Last synchronized: ${row.syncedAt}`,
      '',
      'Sample document generated by the CRC prototype.',
      'The original file is stored in the ERP and is view-only in CRC.',
    ], mode);
    this.store.log(mode === 'view' ? 'Attachment Viewed' : 'Attachment Downloaded', c.reference, `${row.name} (${row.erpAttachmentId}).`, 'Success', undefined, { erpReference: c.erpReference });
  }

  // ---------- escalation ----------
  async updateEscalation(c: Contract) {
    if (!this.ui.requires('Manage Escalations')) return;
    const v = await this.ui.form({
      title: 'Update escalation status', subtitle: `${c.reference} · ${c.name}`, icon: 'edit_note', submitLabel: 'Save status',
      values: { status: this.escalationStatus() === 'Not required' ? 'Pending action' : this.escalationStatus() },
      fields: [
        { key: 'status', label: 'Escalation status', type: 'select', options: ESCALATION_STATUSES.filter((s) => s !== 'Resolved' && s !== 'Closed'), required: true, hint: 'CRC monitoring status only — the contract status itself always comes from the ERP.' },
        { key: 'comments', label: 'Comments', type: 'textarea', required: true, placeholder: 'e.g. Renewal meeting booked with the vendor for next week' },
      ],
    });
    if (!v) return;
    this.ops.recordEscalation(c, { status: v['status'], comments: v['comments'] });
    this.ui.toast('Escalation status updated and recorded in the audit history.');
  }

  async recordResolution(c: Contract) {
    if (!this.ui.requires('Manage Escalations')) return;
    const v = await this.ui.form({
      title: 'Record the resolution', subtitle: `${c.reference} · this does not change any contract data`, icon: 'task_alt', submitLabel: 'Record resolution',
      values: { status: 'Resolved', resolutionDate: today(), responsibleUser: c.contractManager ?? '' },
      fields: [
        { key: 'status', label: 'Resolution status', type: 'select', options: ['Resolved', 'Closed'], required: true },
        { key: 'resolutionDate', label: 'Resolution date', type: 'date', required: true },
        { key: 'responsibleUser', label: 'Responsible user', required: true },
        { key: 'supportingRef', label: 'Supporting reference', placeholder: 'e.g. Email or meeting minute reference' },
        { key: 'erpUpdateRef', label: 'Related ERP update reference', placeholder: 'e.g. ERP-RENEW-4471' },
        { key: 'comments', label: 'Resolution comments', type: 'textarea', required: true },
      ],
    });
    if (!v) return;
    this.ops.recordEscalation(c, { status: v['status'], comments: v['comments'], resolutionDate: v['resolutionDate'], responsibleUser: v['responsibleUser'], supportingRef: v['supportingRef'], erpUpdateRef: v['erpUpdateRef'] });
    this.ui.toast('Resolution recorded in the escalation history and the audit trail.');
  }

  // ---------- monitoring actions ----------
  async actionForm(c: Contract, existing?: MonitoringAction) {
    if (!this.ui.requires('Manage Monitoring Actions')) return;
    const v = await this.ui.form({
      title: existing ? 'Edit monitoring action' : 'New monitoring action', subtitle: `${c.reference} · recorded in CRC only, the contract is not changed`, icon: 'assignment_turned_in', submitLabel: existing ? 'Save changes' : 'Create action',
      values: existing ? { ...existing } : { type: ACTION_TYPES[0], owner: c.contractManager ?? '', status: 'Open', dueDate: addDays(today(), 7) },
      fields: [
        { key: 'type', label: 'Action type', type: 'select', options: [...ACTION_TYPES], required: true },
        { key: 'owner', label: 'Action owner', required: true },
        { key: 'dueDate', label: 'Due date', type: 'date', required: true },
        { key: 'status', label: 'Action status', type: 'select', options: ACTION_STATUSES, required: true },
        { key: 'erpTransactionRef', label: 'Reference to the ERP transaction', placeholder: 'e.g. ERP-RENEW-4471' },
        { key: 'comments', label: 'Comments', type: 'textarea' },
      ],
    });
    if (!v) return;
    if (existing) this.ops.updateAction(existing.id, v);
    else this.ops.addAction(c, v);
    this.ui.toast(existing ? 'Action updated.' : 'Action created.');
  }

  async actionRowAction(e: { row: any; id: string }, c: Contract) {
    if (!this.ui.requires('Manage Monitoring Actions')) return;
    const a = e.row as MonitoringAction;
    if (e.id === 'edit') return this.actionForm(c, a);
    this.ops.updateAction(a.id, { status: e.id === 'complete' ? 'Completed' : 'Closed' });
    this.ui.toast(e.id === 'complete' ? 'Action marked as completed.' : 'Action closed.');
  }

  download(c: Contract) {
    if (!this.ui.requires('Export Contract Data')) return;
    this.ui.csv(`${c.reference}-summary`, [{
      Reference: c.reference, Name: c.name, Vendor: c.vendorName, Type: c.contractType, 'Contract manager': c.contractManager ?? '',
      'Start date': c.startDate, 'End date': c.endDate, 'Days remaining': c.daysRemaining, Amount: c.amount, Currency: c.currency,
      Status: c.status, 'ERP reference': c.erpReference, 'ERP vendor ID': c.erpVendorId ?? '', 'PO number': c.poNumber ?? '', 'All PO numbers': this.pos().map((p) => p.poNumber).join(', '), 'PO value': this.poTotal(), 'Last synced': c.lastSyncedAt,
    }]);
  }
}
