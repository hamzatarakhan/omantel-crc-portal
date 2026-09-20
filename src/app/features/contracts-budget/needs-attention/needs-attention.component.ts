import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { ContractOps } from '../../../core/services/contract-ops.service';
import { UiService } from '../../../shared/services/ui.service';
import { Contract } from '../../../core/models/domain';
import { requiredActionFor, statusLevelFor } from '../../../core/services/contract-monitoring';

@Component({
  selector: 'app-needs-attention',
  standalone: true,
  imports: [CommonModule, RouterModule, PageHeaderComponent, KpiCardComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Needs Attention"
      subtitle="Contracts that need a follow-up, are unresolved or escalated, or are flagged for review"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Monitoring' }, { label: 'Needs Attention' }]"
    ></app-page-header>

    <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
      <app-kpi-card label="Requiring Action" [value]="actionCount()" level="orange" icon="assignment_late"></app-kpi-card>
      <app-kpi-card label="Unresolved" [value]="unresolvedCount()" level="amber" icon="pending_actions"></app-kpi-card>
      <app-kpi-card label="Escalated" [value]="escalatedCount()" [level]="escalatedCount() ? 'red' : 'normal'" icon="priority_high"></app-kpi-card>
      <app-kpi-card label="Flagged for Review" [value]="flaggedCount()" [level]="flaggedCount() ? 'amber' : 'normal'" icon="flag"></app-kpi-card>
      <app-kpi-card label="Open Monitoring Actions" [value]="openActions()" icon="assignment_turned_in"></app-kpi-card>
    </div>

    <app-data-table title="Contracts that need attention" [columns]="columns" [rows]="rows()" [pageSize]="10" [exportable]="store.can('Export Contract Data')" (rowClick)="open($event)" emptyTitle="Nothing needs attention" emptyDescription="Contracts with a required action, an escalation or a review flag appear here."></app-data-table>
    <p class="text-xs text-ink-400 mt-3">Record follow-ups under <a class="text-brand-600 font-medium" routerLink="/contracts-budget/actions">Monitoring Actions</a>; escalation rules are under <a class="text-brand-600 font-medium" routerLink="/contracts-budget/notifications">Alerts &amp; Escalation</a>.</p>
  `,
})
export class NeedsAttentionComponent {
  store = inject(CrcStore);
  private ops = inject(ContractOps);
  private router = inject(Router);
  private ui = inject(UiService);

  private list = computed(() => this.ops.active());
  actionCount = computed(() => this.list().filter((c) => this.ops.needsAction(c)).length);
  unresolvedCount = computed(() => this.list().filter((c) => this.ops.isUnresolved(c)).length);
  escalatedCount = computed(() => this.list().filter((c) => this.ops.isEscalated(c)).length);
  flaggedCount = computed(() => this.list().filter((c) => this.ops.issuesFor(c).length > 0).length);
  openActions = computed(() => this.ops.actions().filter((a) => (a.status === 'Open' || a.status === 'In progress') && this.list().some((c) => c.id === a.contractId)).length);

  rows = computed(() => this.list().filter((c) => this.ops.needsAction(c) || this.ops.isEscalated(c) || this.ops.issuesFor(c).length > 0).map((c) => ({
    ...c, escalation: this.ops.escalationStatus(c), requiredAction: requiredActionFor(c), openActions: this.ops.openActions(c).length, flag: this.ops.issuesFor(c).map((i) => i.code).join(', ') || '—', level: statusLevelFor(c),
  })));

  columns: TableColumn<any>[] = [
    { key: 'reference', label: 'Contract' },
    { key: 'name', label: 'Name' },
    { key: 'vendorName', label: 'Vendor' },
    { key: 'endDate', label: 'End Date', type: 'date' },
    { key: 'status', label: 'Status', type: 'status', statusFn: (r) => ({ label: r.status, level: r.level }) },
    { key: 'requiredAction', label: 'Required Action' },
    { key: 'escalation', label: 'Escalation' },
    { key: 'openActions', label: 'Open actions', type: 'number', align: 'right' },
    { key: 'flag', label: 'Review flag' },
  ];

  open(row: Contract) {
    if (!this.ui.requires('View Contract Details')) return;
    this.router.navigate(['/contracts-budget/contracts', row.id]);
  }
}
