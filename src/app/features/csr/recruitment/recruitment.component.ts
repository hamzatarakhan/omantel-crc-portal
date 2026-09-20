import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DataTableComponent, TableColumn } from '../../../shared/components/data-table/data-table.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { Candidate, CandidateStatus } from '../../../core/models/domain';
import { StatusLevel } from '../../../core/models/status';
import { CandidateDialogComponent } from './candidate-dialog.component';

const STAGES: Array<CandidateStatus | 'All'> = ['All', 'New', 'Interview Scheduled', 'Shortlisted', 'Hired', 'Rejected'];

@Component({
  selector: 'app-recruitment',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, PageHeaderComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Recruitment & Interview Management"
      subtitle="Candidate tracking, scored interviews, and CV storage &middot; click a candidate to schedule, score and decide"
      [breadcrumbs]="[{ label: 'CSR Management', link: '/csr/directory' }, { label: 'Recruitment & Interview' }]"
    >
      <button mat-flat-button color="primary" (click)="addCandidate()"><mat-icon class="!text-base !mr-1">person_add</mat-icon>Add candidate</button>
    </app-page-header>

    <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
      @for (s of stages.slice(1); track s) {
        <button (click)="stage.set(stage() === s ? 'All' : s)" class="surface-card px-4 py-3 text-left hover:border-brand-300 transition-colors" [class.!border-brand-500]="stage() === s">
          <div class="text-[11px] font-bold text-ink-400 uppercase tracking-wide">{{ s }}</div>
          <div class="text-lg font-extrabold text-ink-900 mt-0.5">{{ counts()[s] || 0 }}</div>
        </button>
      }
    </div>

    <app-data-table title="Candidates" [columns]="columns" [rows]="rows()" (rowClick)="open($event)" emptyTitle="No candidates in this stage"></app-data-table>
  `,
})
export class RecruitmentComponent {
  private store = inject(CrcStore);
  private dialog = inject(MatDialog);
  private ui = inject(UiService);

  stages = STAGES;
  stage = signal<CandidateStatus | 'All'>('All');
  counts = computed(() => {
    const c: Record<string, number> = {};
    for (const x of this.store.candidates()) c[x.status] = (c[x.status] || 0) + 1;
    return c;
  });
  rows = computed(() => this.store.candidates().filter((c) => this.stage() === 'All' || c.status === this.stage()).map((c) => ({ ...c, interviewOn: c.interview ? `${c.interview.date} ${c.interview.time}` : '—', cvOnFile: c.cv ? 'Yes' : 'No' })));

  columns: TableColumn<any>[] = [
    { key: 'name', label: 'Candidate' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'department', label: 'Department / Queue' },
    { key: 'appliedDate', label: 'Applied', type: 'date' },
    { key: 'interviewOn', label: 'Interview' },
    { key: 'cvOnFile', label: 'CV' },
    { key: 'score', label: 'Score', type: 'number', align: 'right' },
    { key: 'status', label: 'Status', type: 'status', statusFn: (r) => ({ label: r.status, level: this.level(r.status) }) },
  ];

  level(status: CandidateStatus): StatusLevel {
    return status === 'Hired' ? 'normal' : status === 'Shortlisted' ? 'info' : status === 'Rejected' ? 'red' : status === 'Interview Scheduled' ? 'amber' : 'neutral';
  }

  open(row: Candidate) {
    this.dialog.open(CandidateDialogComponent, { data: { id: row.id }, panelClass: 'app-dialog-panel', autoFocus: false });
  }

  async addCandidate() {
    if (!this.ui.requires('Manage Recruitment')) return;
    const v = await this.ui.form({
      title: 'Add candidate', subtitle: 'Sourced by the vendor from the WFO recruitment pool', icon: 'person_add', submitLabel: 'Add candidate',
      values: { vendor: 'Infoline LLC' },
      fields: [
        { key: 'name', label: 'Full name', required: true },
        { key: 'vendor', label: 'Vendor', type: 'select', options: ['Infoline LLC', 'Green Umbrella Services'], required: true },
        { key: 'department', label: 'Department / Queue', type: 'select', options: ['Sales', 'Retention', 'Complaints', 'Debt Recovery', 'Billing Complaints', 'Payment Channels Support', 'Corporate Telesales', 'Hotline'], required: true },
      ],
    });
    if (!v) return;
    this.store.addCandidate({ name: v['name'], vendor: v['vendor'], department: v['department'] });
    this.ui.toast(`${v['name']} added as a new candidate.`);
  }
}
