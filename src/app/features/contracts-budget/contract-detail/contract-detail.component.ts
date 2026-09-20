import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { Contract, ContractAttachment, ContractRecord } from '../../../core/models/domain';
import { daysRemainingToLevel } from '../../../core/models/status';
import { addDays, attachmentsFor, childRecordsFor, timelineFor } from '../../../core/services/contract-data';
import { RequiresDirective } from '../../../shared/directives/requires.directive';

const kb = (n: number) => (n >= 1024 ? (n / 1024).toFixed(1) + ' MB' : n + ' KB');

@Component({
  selector: 'app-contract-detail',
  standalone: true,
  imports: [RequiresDirective, CommonModule, RouterModule, MatTabsModule, MatButtonModule, MatIconModule, PageHeaderComponent, StatusChipComponent, DataTableComponent],
  template: `
    @if (contract(); as c) {
      <app-page-header
        [title]="c.name"
        [subtitle]="'Reference ' + c.reference + ' · ERP ' + c.erpReference"
        [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Contract List', link: '/contracts-budget/contracts' }, { label: c.reference }]"
      >
        <app-status-chip [label]="c.status" [level]="level(c)"></app-status-chip>
        <button mat-stroked-button (click)="download(c)"><mat-icon class="!text-base !mr-1">download</mat-icon>Download summary</button>
        <button mat-flat-button color="primary" (click)="sync(c)" appRequires="Manual Contract Sync" [disabled]="syncing()">
          <mat-icon class="!text-base !mr-1" [class.animate-spin]="syncing()">sync</mat-icon>
          {{ syncing() ? 'Syncing…' : 'Sync from ERP' }}
        </button>
      </app-page-header>

      @if (syncMessage()) {
        <div class="status-chip mb-4" [class.status-chip--normal]="!syncChanged()" [class.status-chip--info]="syncChanged()">{{ syncMessage() }}</div>
      }

      <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Vendor</div><div class="text-sm font-medium text-ink-900 mt-0.5">{{ c.vendorName }}</div></div>
        <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Contract Amount</div><div class="text-sm font-medium text-ink-900 mt-0.5">{{ c.amount | number:'1.0-2' }} {{ c.currency }}</div></div>
        <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Start &rarr; End Date</div><div class="text-sm font-medium text-ink-900 mt-0.5">{{ c.startDate }} &rarr; {{ c.endDate }}</div></div>
        <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Days Remaining</div><div class="text-sm font-medium mt-0.5" [class]="c.daysRemaining < 0 ? 'text-status-red' : 'text-ink-900'">{{ c.daysRemaining }}</div></div>
        <div class="surface-card px-4 py-3 col-span-2 md:col-span-1"><div class="text-xs text-ink-400">ERP reference</div><div class="text-sm font-medium text-ink-900 mt-0.5">{{ c.erpReference }}</div></div>
      </div>

      <mat-tab-group>
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
                  <div><dt class="text-xs text-ink-400">Contract type</dt><dd class="font-medium text-ink-900">{{ c.contractType }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Record type</dt><dd class="font-medium text-ink-900">{{ c.recordType }}</dd></div>
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
                  <div><div class="text-xs text-ink-400">Committed in POs</div><div class="text-base font-extrabold text-ink-900">{{ poValue() | number:'1.0-0' }} <span class="text-xs font-medium text-ink-400">{{ c.currency }}</span></div></div>
                  <div><div class="text-xs text-ink-400">Remaining headroom</div><div class="text-base font-extrabold text-status-normal">{{ c.amount - poValue() | number:'1.0-0' }} <span class="text-xs font-medium text-ink-400">{{ c.currency }}</span></div></div>
                  <div><div class="text-xs text-ink-400">Amendments</div><div class="text-base font-extrabold text-ink-900">{{ amendmentValue() | number:'1.0-0' }} <span class="text-xs font-medium text-ink-400">{{ c.currency }}</span></div></div>
                </div>
                <div class="h-2 rounded-full bg-surface-subtle mt-4 overflow-hidden"><div class="h-full rounded-full bg-brand-500" [style.width.%]="min(100, poValue() / c.amount * 100)"></div></div>
                <div class="text-xs text-ink-400 mt-1.5">{{ (poValue() / c.amount * 100) | number:'1.0-0' }}% of the contract value is committed in purchase orders.</div>
              </div>
            </div>

            <div class="flex flex-col gap-4">
              <div class="surface-card px-4 pt-3.5 pb-4">
                <h3 class="text-[13.5px] font-bold text-ink-900">ERP record</h3>
                <dl class="grid grid-cols-1 gap-y-3 mt-3 text-sm">
                  <div><dt class="text-xs text-ink-400">ERP reference</dt><dd class="font-medium text-ink-900">{{ c.erpReference }}</dd></div>
                  <div><dt class="text-xs text-ink-400">ERP vendor ID</dt><dd class="font-medium text-ink-900">{{ c.erpVendorId }}</dd></div>
                  <div><dt class="text-xs text-ink-400">PO number</dt><dd class="font-medium text-ink-900">{{ c.poNumber }}</dd></div>
                  <div><dt class="text-xs text-ink-400">ERP status</dt><dd class="font-medium text-ink-900">{{ c.erpStatus }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Created in ERP</dt><dd class="font-medium text-ink-900">{{ c.erpCreatedAt }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Last modified in ERP</dt><dd class="font-medium text-ink-900">{{ c.erpModifiedAt }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Last synchronized</dt><dd class="font-medium text-ink-900">{{ c.lastSyncedAt | date:'medium' }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Linked records &middot; attachments</dt><dd class="font-medium text-ink-900">{{ children().length }} &middot; {{ attachments().length }}</dd></div>
                </dl>
              </div>
              <div class="surface-card px-4 pt-3.5 pb-4">
                <h3 class="text-[13.5px] font-bold text-ink-900">Key dates</h3>
                <dl class="grid grid-cols-1 gap-y-3 mt-3 text-sm">
                  <div><dt class="text-xs text-ink-400">Start</dt><dd class="font-medium text-ink-900">{{ c.startDate }}</dd></div>
                  <div><dt class="text-xs text-ink-400">End</dt><dd class="font-medium text-ink-900">{{ c.endDate }}</dd></div>
                  <div><dt class="text-xs text-ink-400">Next expiry alert</dt><dd class="font-medium text-ink-900">{{ nextAlert() || 'None scheduled' }}</dd></div>
                  <div><dt class="text-xs text-ink-400">48-hour escalation</dt><dd class="font-medium text-ink-900">{{ escalationDate() }}</dd></div>
                </dl>
              </div>
              <p class="text-xs text-ink-400 leading-relaxed">All fields are synced read-only from the ERP. To correct a value, update it in the ERP; it appears here after the next synchronization.</p>
            </div>
          </div>
        </mat-tab>

        <!-- ============ Child contracts & POs ============ -->
        <mat-tab [label]="'Child Contracts & POs (' + children().length + ')'">
          <div class="pt-4">
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div class="surface-card px-4 py-3"><div class="text-[11px] font-bold text-ink-400 uppercase tracking-wide">Purchase orders</div><div class="text-lg font-extrabold text-ink-900">{{ count('Purchase Order') }}</div></div>
              <div class="surface-card px-4 py-3"><div class="text-[11px] font-bold text-ink-400 uppercase tracking-wide">Subcontracts</div><div class="text-lg font-extrabold text-ink-900">{{ count('Subcontract') }}</div></div>
              <div class="surface-card px-4 py-3"><div class="text-[11px] font-bold text-ink-400 uppercase tracking-wide">Amendments</div><div class="text-lg font-extrabold text-ink-900">{{ count('Amendment') }}</div></div>
              <div class="surface-card px-4 py-3"><div class="text-[11px] font-bold text-ink-400 uppercase tracking-wide">Time extensions</div><div class="text-lg font-extrabold text-ink-900">{{ count('Time Extension') }}</div></div>
            </div>
            <app-data-table title="Records linked in the ERP" [columns]="childColumns" [rows]="children()" [pageSize]="10" emptyTitle="No linked records" emptyDescription="POs, subcontracts, amendments and time extensions linked to this contract appear here."></app-data-table>
          </div>
        </mat-tab>

        <!-- ============ Attachments ============ -->
        <mat-tab [label]="'Attachments (' + attachments().length + ')'">
          <div class="pt-4">
            <app-data-table title="Documents held in the ERP" [columns]="attachmentColumns" [rows]="attachmentRows()" [pageSize]="10" (rowClick)="downloadAttachment($event)"></app-data-table>
            <p class="text-xs text-ink-400 mt-3">Click a row to download the document. Files are stored in the ERP and are view-only here; the prototype generates a sample PDF for each.</p>
          </div>
        </mat-tab>

        <!-- ============ Notifications & Escalations ============ -->
        <mat-tab label="Notifications & Escalations">
          <div class="pt-4 flex flex-col gap-4">
            <div class="surface-card px-4 py-3.5 flex items-center gap-3 flex-wrap">
              <span class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" [class]="escalation().tone"><mat-icon class="!text-[19px]">{{ escalation().icon }}</mat-icon></span>
              <div class="flex-1 min-w-[220px]">
                <div class="text-sm font-semibold text-ink-900">48-hour escalation — {{ escalation().title }}</div>
                <div class="text-xs text-ink-500 mt-0.5">{{ escalation().text }}</div>
              </div>
              @if (escalation().canAck) {
                <button mat-stroked-button (click)="acknowledge(c)" appRequires="Manual Contract Sync"><mat-icon class="!text-base !mr-1">task_alt</mat-icon>Acknowledge escalation</button>
              }
            </div>

            <app-data-table title="Alert schedule" [columns]="alertColumns" [rows]="alerts()" [exportable]="false" emptyTitle="No alert rules apply" emptyDescription="Create a rule under Notification Config."></app-data-table>
            <app-data-table title="Delivery log" [columns]="deliveryColumns" [rows]="deliveryRows()" emptyTitle="Nothing sent yet" emptyDescription="Alerts appear here once their date has passed."></app-data-table>
            <p class="text-xs text-ink-400">Rules are managed on <a class="text-brand-600 font-medium" routerLink="/contracts-budget/notifications">Notification Config</a>.</p>
          </div>
        </mat-tab>

        <!-- ============ Audit history ============ -->
        <mat-tab [label]="'Audit History (' + auditRows().length + ')'">
          <div class="pt-4">
            <app-data-table title="Everything that happened to this contract" [columns]="auditColumns" [rows]="auditRows()" [pageSize]="10"></app-data-table>
          </div>
        </mat-tab>
      </mat-tab-group>
    } @else {
      <div class="surface-card p-8 text-center text-sm text-ink-500">This contract could not be found. <a class="text-brand-600 font-medium" routerLink="/contracts-budget/contracts">Back to the contract list</a></div>
    }
  `,
})
export class ContractDetailComponent {
  private store = inject(CrcStore);
  private ui = inject(UiService);
  private router = inject(Router);
  private id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('id'))));

  syncing = signal(false);
  syncMessage = signal('');
  syncChanged = signal(false);

  contract = computed(() => this.store.contracts().find((c) => c.id === this.id()));
  children = computed<ContractRecord[]>(() => { const c = this.contract(); return c ? childRecordsFor(c) : []; });
  attachments = computed<ContractAttachment[]>(() => { const c = this.contract(); return c ? attachmentsFor(c, this.children()) : []; });
  attachmentRows = computed(() => this.attachments().map((a) => ({ ...a, size: kb(a.sizeKb) })));
  timeline = computed(() => { const c = this.contract(); return c ? timelineFor(c, this.children(), this.attachments(), this.store.notificationRules()) : []; });

  poValue = computed(() => this.children().filter((r) => r.recordType === 'Purchase Order').reduce((s, r) => s + r.amount, 0));
  amendmentValue = computed(() => this.children().filter((r) => r.recordType === 'Amendment').reduce((s, r) => s + r.amount, 0));

  alerts = computed(() => {
    const c = this.contract();
    if (!c) return [];
    const today = new Date().toISOString().slice(0, 10);
    return this.store.notificationRules()
      .filter((r) => r.active && (r.contractType === 'All Contracts' || r.contractType === c.contractType))
      .map((r) => { const date = addDays(c.endDate, -r.thresholdDays); return { days: r.thresholdDays, alertDate: date, channel: r.channel, recipients: r.recipients, state: date <= today ? 'Sent' : 'Scheduled' }; })
      .sort((a, b) => b.days - a.days);
  });
  nextAlert = computed(() => this.alerts().filter((a) => a.state === 'Scheduled').map((a) => a.alertDate).sort()[0]);
  escalationDate = computed(() => { const c = this.contract(); return c ? addDays(c.endDate, -2) : ''; });

  deliveryRows = computed(() => this.timeline().filter((e) => e.kind === 'notice' || e.kind === 'alert' || e.kind === 'escalation').map((e) => ({ when: e.at, type: e.title, channel: e.channel ?? '', recipients: e.recipients ?? '', delivery: e.result === 'Success' ? 'Delivered' : 'Failed', details: e.details })));
  auditRows = computed(() => { const c = this.contract(); return c ? this.store.audit().filter((a) => a.reference === c.reference) : []; });

  escalation = computed(() => {
    const c = this.contract();
    if (!c) return { title: '', text: '', icon: 'info', tone: '', canAck: false };
    const today = new Date().toISOString().slice(0, 10);
    const date = addDays(c.endDate, -2);
    const ack = this.store.escalationAcks()[c.id];
    if (today < date) return { title: 'not due yet', text: `Triggers on ${date} if the contract has not been renewed or closed.`, icon: 'schedule', tone: 'bg-brand-50 text-brand-600', canAck: false };
    if (ack) return { title: 'acknowledged', text: `Escalated to Senior Management on ${date}. Acknowledged by ${ack.by} on ${ack.at.slice(0, 10)}${ack.note ? ' — ' + ack.note : ''}.`, icon: 'task_alt', tone: 'bg-emerald-50 text-status-normal', canAck: false };
    return { title: 'awaiting acknowledgement', text: `Escalated to Senior Management on ${date}${c.renewalStatus ? ` (${c.renewalStatus.toLowerCase()})` : ' — no renewal on record'}. The contract owner should acknowledge it.`, icon: 'priority_high', tone: 'bg-red-50 text-status-red', canAck: true };
  });

  childColumns: TableColumn<any>[] = [
    { key: 'reference', label: 'Reference' },
    { key: 'recordType', label: 'Type' },
    { key: 'description', label: 'Description' },
    { key: 'counterparty', label: 'Counterparty' },
    { key: 'erpReference', label: 'ERP reference' },
    { key: 'issuedDate', label: 'Issued', type: 'date' },
    { key: 'startDate', label: 'Start', type: 'date' },
    { key: 'endDate', label: 'End', type: 'date' },
    { key: 'amount', label: 'Amount', type: 'currency', align: 'right' },
    { key: 'status', label: 'Status', type: 'status', statusFn: (r) => ({ label: r.status, level: r.status === 'Closed' ? 'neutral' : r.status === 'Expiring Soon' ? daysRemainingToLevel(r.daysRemaining) : 'normal' }) },
  ];

  attachmentColumns: TableColumn<any>[] = [
    { key: 'name', label: 'Document' },
    { key: 'type', label: 'Type' },
    { key: 'linkedTo', label: 'Linked to' },
    { key: 'erpAttachmentId', label: 'ERP attachment ID' },
    { key: 'erpDocumentRef', label: 'ERP document ref' },
    { key: 'size', label: 'Size', align: 'right' },
    { key: 'uploadedBy', label: 'Uploaded by' },
    { key: 'uploadedAt', label: 'Uploaded', type: 'date' },
    { key: 'syncedAt', label: 'Synced', type: 'date' },
  ];

  alertColumns: TableColumn<any>[] = [
    { key: 'days', label: 'Days before expiry', type: 'number', align: 'right' },
    { key: 'alertDate', label: 'Alert date', type: 'date' },
    { key: 'channel', label: 'Channel' },
    { key: 'recipients', label: 'Recipients' },
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

  auditColumns: TableColumn<any>[] = [
    { key: 'timestamp', label: 'Timestamp', type: 'date' },
    { key: 'actor', label: 'Actor' },
    { key: 'activityType', label: 'Activity' },
    { key: 'details', label: 'Details' },
    { key: 'result', label: 'Result', type: 'status', statusFn: (r) => ({ label: r.result, level: r.result === 'Success' ? 'normal' : 'red' }) },
  ];

  level(c: Contract) {
    return daysRemainingToLevel(c.daysRemaining);
  }

  min(a: number, b: number) {
    return Math.min(a, b);
  }

  count(type: ContractRecord['recordType']) {
    return this.children().filter((r) => r.recordType === type).length;
  }

  sync(c: Contract) {
    if (!this.ui.requires('Manual Contract Sync')) return;
    this.syncing.set(true);
    this.syncMessage.set('');
    setTimeout(() => {
      const res = this.store.syncContract(c.id);
      this.syncing.set(false);
      this.syncChanged.set(res.changed);
      this.syncMessage.set(res.message);
    }, 1000);
  }

  async acknowledge(c: Contract) {
    if (!this.ui.requires('Manual Contract Sync')) return;
    const v = await this.ui.form({
      title: 'Acknowledge the escalation', subtitle: `${c.reference} · ${c.name}`, icon: 'task_alt', submitLabel: 'Acknowledge',
      fields: [{ key: 'note', label: 'Action taken (optional)', type: 'textarea', placeholder: 'e.g. Renewal meeting booked with the vendor for next week' }],
    });
    if (!v) return;
    this.store.acknowledgeEscalation(c.id, v['note'] ?? '');
    this.ui.toast('Escalation acknowledged and recorded in the audit history.');
  }

  downloadAttachment(row: ContractAttachment) {
    const c = this.contract();
    if (!c) return;
    this.ui.pdf(row.name, row.type, [
      `Contract: ${c.reference} - ${c.name}`,
      `Vendor: ${c.vendorName}`,
      `Linked to: ${row.linkedTo}`,
      '',
      `ERP attachment ID: ${row.erpAttachmentId}`,
      `ERP document reference: ${row.erpDocumentRef}`,
      `Uploaded by ${row.uploadedBy} on ${row.uploadedAt}`,
      `Last synchronized: ${row.syncedAt}`,
      '',
      'Sample document generated by the CRC prototype.',
      'The original file is stored in the ERP and is view-only in CRC.',
    ]);
  }

  download(c: Contract) {
    this.ui.csv(`${c.reference}-summary`, [{
      Reference: c.reference, Name: c.name, Vendor: c.vendorName, Type: c.contractType, 'Contract manager': c.contractManager ?? '',
      'Start date': c.startDate, 'End date': c.endDate, 'Days remaining': c.daysRemaining, Amount: c.amount, Currency: c.currency,
      Status: c.status, 'ERP reference': c.erpReference, 'ERP vendor ID': c.erpVendorId ?? '', 'PO number': c.poNumber ?? '', 'Last synced': c.lastSyncedAt,
    }]);
  }
}
