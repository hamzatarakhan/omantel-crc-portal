import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { MockDataService } from '../../../core/services/mock-data.service';
import { AuditEntry } from '../../../core/models/domain';

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Audit Log"
      subtitle="Every synchronization, notification, escalation, and monitoring action across CRC"
      [breadcrumbs]="[{ label: 'Administration' }, { label: 'Audit Log' }]"
    ></app-page-header>
    <app-data-table [columns]="columns" [rows]="entries"></app-data-table>
  `,
})
export class AuditLogComponent {
  private data = inject(MockDataService);
  entries: AuditEntry[] = this.data.getAuditLog();

  columns: TableColumn<AuditEntry>[] = [
    { key: 'timestamp', label: 'Timestamp', type: 'date' },
    { key: 'actor', label: 'Actor' },
    { key: 'activityType', label: 'Activity Type' },
    { key: 'reference', label: 'Reference' },
    {
      key: 'result', label: 'Result', type: 'status',
      statusFn: (r) => ({ label: r.result, level: r.result === 'Success' ? 'normal' : 'red' }),
    },
    { key: 'details', label: 'Details' },
  ];
}
