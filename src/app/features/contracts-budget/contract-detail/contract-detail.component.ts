import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { MockDataService } from '../../../core/services/mock-data.service';
import { Contract, AuditEntry } from '../../../core/models/domain';
import { daysRemainingToLevel } from '../../../core/models/status';

@Component({
  selector: 'app-contract-detail',
  standalone: true,
  imports: [CommonModule, MatTabsModule, MatButtonModule, MatIconModule, PageHeaderComponent, StatusChipComponent, DataTableComponent],
  template: `
    @if (contract) {
      <app-page-header
        [title]="contract.name"
        [subtitle]="'Reference ' + contract.reference + ' · ERP ' + contract.erpReference"
        [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Contract List', link: '/contracts-budget/contracts' }, { label: contract.reference }]"
      >
        <app-status-chip [label]="contract.status" [level]="daysRemainingToLevel(contract.daysRemaining)"></app-status-chip>
        <button mat-flat-button color="primary" (click)="sync()" [disabled]="syncing()">
          <mat-icon class="!text-base !mr-1">{{ syncing() ? 'sync' : 'sync' }}</mat-icon>
          {{ syncing() ? 'Syncing…' : 'Sync from ERP' }}
        </button>
      </app-page-header>

      @if (syncMessage()) {
        <div class="status-chip status-chip--normal mb-4">{{ syncMessage() }}</div>
      }

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="surface-card px-4 py-3">
          <div class="text-xs text-ink-400">Vendor</div>
          <div class="text-sm font-medium text-ink-900 mt-0.5">{{ contract.vendorName }}</div>
        </div>
        <div class="surface-card px-4 py-3">
          <div class="text-xs text-ink-400">Contract Amount</div>
          <div class="text-sm font-medium text-ink-900 mt-0.5">{{ contract.amount | number:'1.0-2' }} {{ contract.currency }}</div>
        </div>
        <div class="surface-card px-4 py-3">
          <div class="text-xs text-ink-400">Start &rarr; End Date</div>
          <div class="text-sm font-medium text-ink-900 mt-0.5">{{ contract.startDate }} &rarr; {{ contract.endDate }}</div>
        </div>
        <div class="surface-card px-4 py-3">
          <div class="text-xs text-ink-400">Days Remaining</div>
          <div class="text-sm font-medium text-ink-900 mt-0.5">{{ contract.daysRemaining }}</div>
        </div>
      </div>

      <mat-tab-group>
        <mat-tab label="Summary">
          <div class="pt-4 text-sm text-ink-700 space-y-2 max-w-2xl">
            <p><span class="text-ink-400">Record Type:</span> {{ contract.recordType }}</p>
            <p><span class="text-ink-400">Parent Contract:</span> {{ contract.parentReference || '— (this is a parent contract)' }}</p>
            <p><span class="text-ink-400">Renewal Status:</span> {{ contract.renewalStatus || 'Not applicable' }}</p>
            <p><span class="text-ink-400">Last Synchronized:</span> {{ contract.lastSyncedAt | date:'medium' }}</p>
            <p class="text-xs text-ink-400 pt-2">All fields on this page are synced read-only from the ERP. To correct any value, update it in the ERP; the change will appear here after the next synchronization.</p>
          </div>
        </mat-tab>
        <mat-tab label="Child Contracts & POs">
          <div class="pt-4">
            <app-data-table [columns]="childColumns" [rows]="childRows"></app-data-table>
          </div>
        </mat-tab>
        <mat-tab label="Attachments">
          <div class="pt-4 text-sm text-ink-500">
            <div class="surface-card p-4 flex items-center gap-3">
              <mat-icon class="!text-ink-400">description</mat-icon>
              <div>
                <div class="font-medium text-ink-700">{{ contract.reference }}-signed.pdf</div>
                <div class="text-xs text-ink-400">Synced from ERP &middot; 842 KB &middot; View only</div>
              </div>
            </div>
          </div>
        </mat-tab>
        <mat-tab label="Notifications & Escalations">
          <div class="pt-4 text-sm text-ink-700 space-y-2">
            <p>Expiry alerts configured at 30 / 15 / 5 days before {{ contract.endDate }}.</p>
            <p>Escalation to senior management triggers 48 hours before expiry if unresolved.</p>
          </div>
        </mat-tab>
        <mat-tab label="Audit History">
          <div class="pt-4">
            <app-data-table [columns]="auditColumns" [rows]="auditRows"></app-data-table>
          </div>
        </mat-tab>
      </mat-tab-group>
    }
  `,
})
export class ContractDetailComponent {
  contract?: Contract;
  syncing = signal(false);
  syncMessage = signal('');
  daysRemainingToLevel = daysRemainingToLevel;

  childColumns: TableColumn[] = [
    { key: 'reference', label: 'Reference' },
    { key: 'name', label: 'Name' },
    { key: 'recordType', label: 'Type' },
    { key: 'amount', label: 'Amount', type: 'currency', align: 'right' },
    { key: 'status', label: 'Status', type: 'status', statusFn: (r: any) => ({ label: r.status, level: daysRemainingToLevel(r.daysRemaining) }) },
  ];
  childRows: Contract[] = [];

  auditColumns: TableColumn<AuditEntry>[] = [
    { key: 'timestamp', label: 'Timestamp', type: 'date' },
    { key: 'actor', label: 'Actor' },
    { key: 'activityType', label: 'Activity' },
    { key: 'result', label: 'Result', type: 'status', statusFn: (r) => ({ label: r.result, level: r.result === 'Success' ? 'normal' : 'red' }) },
  ];
  auditRows: AuditEntry[] = [];

  constructor(private route: ActivatedRoute, private data: MockDataService) {
    const id = this.route.snapshot.paramMap.get('id');
    const all = this.data.getContracts();
    this.contract = all.find((c) => c.id === id) || all[0];
    this.childRows = all.filter((c) => c.id !== this.contract?.id).slice(0, 3);
    this.auditRows = this.data.getAuditLog().slice(0, 5);
  }

  sync() {
    this.syncing.set(true);
    this.syncMessage.set('');
    setTimeout(() => {
      this.syncing.set(false);
      this.syncMessage.set('Synchronization completed successfully — no changes found.');
    }, 1200);
  }
}
