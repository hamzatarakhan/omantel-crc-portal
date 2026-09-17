import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { MockDataService } from '../../../core/services/mock-data.service';
import { Candidate } from '../../../core/models/domain';
import { StatusLevel } from '../../../core/models/status';

@Component({
  selector: 'app-recruitment',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Recruitment & Interview Management"
      subtitle="Candidate tracking, scored interviews, and CV storage"
      [breadcrumbs]="[{ label: 'CSR Management', link: '/csr/directory' }, { label: 'Recruitment & Interview' }]"
    ></app-page-header>
    <app-data-table [columns]="columns" [rows]="candidates"></app-data-table>
  `,
})
export class RecruitmentComponent {
  private data = inject(MockDataService);
  candidates: Candidate[] = this.data.getCandidates();

  columns: TableColumn<Candidate>[] = [
    { key: 'name', label: 'Candidate' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'department', label: 'Department / Queue' },
    { key: 'appliedDate', label: 'Applied', type: 'date' },
    { key: 'score', label: 'Score', type: 'number', align: 'right' },
    {
      key: 'status', label: 'Status', type: 'status',
      statusFn: (r) => ({ label: r.status, level: this.level(r.status) }),
    },
  ];

  level(status: Candidate['status']): StatusLevel {
    return status === 'Hired' ? 'normal' : status === 'Shortlisted' ? 'info' : 'red';
  }
}
