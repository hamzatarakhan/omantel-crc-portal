import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { MockDataService } from '../../../core/services/mock-data.service';
import { MovementRequest } from '../../../core/models/domain';
import { StatusLevel } from '../../../core/models/status';

@Component({
  selector: 'app-review',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, PageHeaderComponent, StatusChipComponent],
  template: `
    <app-page-header
      title="Request Review & Approval"
      subtitle="Approve or reject pending movement requests"
      [breadcrumbs]="[{ label: 'Internal Project Movement', link: '/movement/dashboard' }, { label: 'Request Review' }]"
    ></app-page-header>

    <div class="surface-card overflow-hidden">
      @for (r of pending; track r.id) {
        <div class="flex items-center justify-between px-4 py-3 border-b border-surface-border last:border-0 flex-wrap gap-2">
          <div>
            <div class="text-sm font-medium text-ink-900">{{ r.agentName }}</div>
            <div class="text-xs text-ink-400">{{ r.project }} &middot; {{ r.startDate }} &rarr; {{ r.endDate }}</div>
          </div>
          <div class="flex items-center gap-2">
            <app-status-chip label="Pending" level="amber"></app-status-chip>
            <button mat-stroked-button color="warn" class="!text-xs" (click)="decide(r, 'Rejected')">Reject</button>
            <button mat-flat-button color="primary" class="!text-xs" (click)="decide(r, 'Active')">Approve</button>
          </div>
        </div>
      }
      @if (pending.length === 0) {
        <div class="p-8 text-center text-sm text-ink-400">No pending requests &mdash; you're all caught up.</div>
      }
    </div>
  `,
})
export class ReviewComponent {
  private data = inject(MockDataService);
  requests: MovementRequest[] = this.data.getMovementRequests();
  get pending() { return this.requests.filter((r) => r.status === 'Pending'); }

  constructor(private snack: MatSnackBar) {}

  decide(r: MovementRequest, outcome: MovementRequest['status']) {
    r.status = outcome;
    this.snack.open(`${r.agentName}'s request ${outcome === 'Rejected' ? 'rejected' : 'approved'} — agent and manager notified.`, 'Dismiss', { duration: 3000 });
  }
}
