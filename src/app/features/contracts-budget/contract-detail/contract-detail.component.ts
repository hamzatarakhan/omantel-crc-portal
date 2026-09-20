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
import { Contract } from '../../../core/models/domain';
import { daysRemainingToLevel } from '../../../core/models/status';

@Component({
  selector: 'app-contract-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, MatTabsModule, MatButtonModule, MatIconModule, PageHeaderComponent, StatusChipComponent, DataTableComponent],
  template: `
    @if (contract(); as c) {
      <app-page-header
        [title]="c.name"
        [subtitle]="'Reference ' + c.reference + ' · ERP ' + c.erpReference"
        [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Contract List', link: '/contracts-budget/contracts' }, { label: c.reference }]"
      >
        <app-status-chip [label]="c.status" [level]="level(c)"></app-status-chip>
        <button mat-stroked-button (click)="download(c)"><mat-icon class="!text-base !mr-1">download</mat-icon>Download summary</button>
        <button mat-flat-button color="primary" (click)="sync(c)" [disabled]="syncing()">
          <mat-icon class="!text-base !mr-1" [class.animate-spin]="syncing()">sync</mat-icon>
          {{ syncing() ? 'Syncing…' : 'Sync from ERP' }}
        </button>
      </app-page-header>

      @if (syncMessage()) {
        <div class="status-chip mb-4" [class.status-chip--normal]="!syncChanged()" [class.status-chip--info]="syncChanged()">{{ syncMessage() }}</div>
      }

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="surface-card px-4 py-3">
          <div class="text-xs text-ink-400">Vendor</div>
          <div class="text-sm font-medium text-ink-900 mt-0.5">{{ c.vendorName }}</div>
        </div>
        <div class="surface-card px-4 py-3">
          <div class="text-xs text-ink-400">Contract Amount</div>
          <div class="text-sm font-medium text-ink-900 mt-0.5">{{ c.amount | number:'1.0-2' }} {{ c.currency }}</div>
        </div>
        <div class="surface-card px-4 py-3">
          <div class="text-xs text-ink-400">Start &rarr; End Date</div>
          <div class="text-sm font-medium text-ink-900 mt-0.5">{{ c.startDate }} &rarr; {{ c.endDate }}</div>
        </div>
        <div class="surface-card px-4 py-3">
          <div class="text-xs text-ink-400">Days Remaining</div>
          <div class="text-sm font-medium text-ink-900 mt-0.5">{{ c.daysRemaining }}</div>
        </div>
      </div>

      <mat-tab-group>
        <mat-tab label="Summary">
          <div class="pt-4 text-sm text-ink-700 space-y-2 max-w-2xl">
            <p><span class="text-ink-400">Record Type:</span> {{ c.recordType }}</p>
            <p>
              <span class="text-ink-400">Parent Contract:</span>
              @if (parent(); as p) { <a class="text-brand-600 font-medium" [routerLink]="['/contracts-budget/contracts', p.id]">{{ p.reference }}</a> } @else { — (this is a parent contract) }
            </p>
            <p><span class="text-ink-400">Renewal Status:</span> {{ c.renewalStatus || 'Not applicable' }}</p>
            <p><span class="text-ink-400">Last Synchronized:</span> {{ c.lastSyncedAt | date:'medium' }}</p>
            <p class="text-xs text-ink-400 pt-2">All fields on this page are synced read-only from the ERP. To correct any value, update it in the ERP; the change will appear here after the next synchronization.</p>
          </div>
        </mat-tab>
        <mat-tab [label]="'Child Contracts & POs (' + children().length + ')'">
          <div class="pt-4">
            <app-data-table [columns]="childColumns" [rows]="children()" (rowClick)="openContract($event)" emptyTitle="No child contracts or POs" emptyDescription="Subcontracts, POs and amendments linked to this contract appear here."></app-data-table>
          </div>
        </mat-tab>
        <mat-tab label="Attachments">
          <div class="pt-4 text-sm text-ink-500">
            <div class="surface-card p-4 flex items-center gap-3 max-w-lg">
              <mat-icon class="!text-ink-400">description</mat-icon>
              <div class="flex-1">
                <div class="font-medium text-ink-700">{{ c.reference }}-signed.pdf</div>
                <div class="text-xs text-ink-400">Synced from ERP &middot; 842 KB &middot; View only</div>
              </div>
              <button mat-stroked-button class="!text-xs" (click)="download(c)">Download</button>
            </div>
          </div>
        </mat-tab>
        <mat-tab label="Notifications & Escalations">
          <div class="pt-4">
            <app-data-table [columns]="alertColumns" [rows]="alerts()" [exportable]="false" emptyTitle="No alert rules apply" emptyDescription="Create a rule under Notification Config."></app-data-table>
            <p class="text-xs text-ink-400 mt-3">Escalation to senior management triggers 48 hours before expiry if unresolved. <a class="text-brand-600 font-medium" routerLink="/contracts-budget/notifications">Manage rules</a></p>
          </div>
        </mat-tab>
        <mat-tab [label]="'Audit History (' + auditRows().length + ')'">
          <div class="pt-4">
            <app-data-table [columns]="auditColumns" [rows]="auditRows()"></app-data-table>
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
  parent = computed(() => {
    const c = this.contract();
    return c?.parentReference ? this.store.contracts().find((x) => x.reference === c.parentReference) : undefined;
  });
  children = computed(() => {
    const c = this.contract();
    return c ? this.store.contracts().filter((x) => x.parentReference === c.reference) : [];
  });

  alerts = computed(() => {
    const c = this.contract();
    if (!c) return [];
    return this.store.notificationRules()
      .filter((r) => r.active && (r.contractType === 'All Contracts' || r.contractType === c.contractType))
      .map((r) => {
        const d = new Date(c.endDate);
        d.setDate(d.getDate() - r.thresholdDays);
        const date = d.toISOString().slice(0, 10);
        return { days: r.thresholdDays, alertDate: date, channel: r.channel, recipients: r.recipients, state: date <= new Date().toISOString().slice(0, 10) ? 'Sent' : 'Scheduled' };
      })
      .sort((a, b) => b.days - a.days);
  });

  auditRows = computed(() => {
    const c = this.contract();
    if (!c) return [];
    const own = this.store.audit().filter((a) => a.reference === c.reference);
    return [...own, { id: 'base', timestamp: c.startDate + 'T00:00:00', actor: 'System (Scheduled Sync)', activityType: 'Record created from ERP', reference: c.reference, result: 'Success' as const, details: 'Initial synchronization from the ERP.' }];
  });

  childColumns: TableColumn[] = [
    { key: 'reference', label: 'Reference' },
    { key: 'name', label: 'Name' },
    { key: 'recordType', label: 'Type' },
    { key: 'amount', label: 'Amount', type: 'currency', align: 'right' },
    { key: 'status', label: 'Status', type: 'status', statusFn: (r: any) => ({ label: r.status, level: daysRemainingToLevel(r.daysRemaining) }) },
  ];

  alertColumns: TableColumn[] = [
    { key: 'days', label: 'Days before expiry', type: 'number', align: 'right' },
    { key: 'alertDate', label: 'Alert date', type: 'date' },
    { key: 'channel', label: 'Channel' },
    { key: 'recipients', label: 'Recipients' },
    { key: 'state', label: 'State', type: 'status', statusFn: (r: any) => ({ label: r.state, level: r.state === 'Sent' ? 'normal' : 'info' }) },
  ];

  auditColumns: TableColumn[] = [
    { key: 'timestamp', label: 'Timestamp', type: 'date' },
    { key: 'actor', label: 'Actor' },
    { key: 'activityType', label: 'Activity' },
    { key: 'details', label: 'Details' },
    { key: 'result', label: 'Result', type: 'status', statusFn: (r: any) => ({ label: r.result, level: r.result === 'Success' ? 'normal' : 'red' }) },
  ];

  level(c: Contract) {
    return daysRemainingToLevel(c.daysRemaining);
  }

  openContract(row: Contract) {
    this.router.navigate(['/contracts-budget/contracts', row.id]);
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

  download(c: Contract) {
    this.ui.csv(`${c.reference}-summary`, [{
      Reference: c.reference, Name: c.name, Vendor: c.vendorName, Type: c.contractType, 'Record type': c.recordType,
      'Start date': c.startDate, 'End date': c.endDate, 'Days remaining': c.daysRemaining, Amount: c.amount, Currency: c.currency,
      Status: c.status, 'ERP reference': c.erpReference, 'Last synced': c.lastSyncedAt,
    }]);
  }
}
