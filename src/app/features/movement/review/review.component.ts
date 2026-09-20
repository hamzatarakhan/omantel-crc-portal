import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { MovementRequest } from '../../../core/models/domain';

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

    <h2 class="text-[13px] font-bold text-ink-900 mb-2">Pending ({{ pending().length }})</h2>
    <div class="surface-card overflow-hidden mb-6">
      @for (r of pending(); track r.id) {
        <div class="flex items-start justify-between px-4 py-3 border-b border-surface-border last:border-0 flex-wrap gap-3">
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium text-ink-900">{{ r.agentName }} <span class="text-ink-400 font-normal">&middot; from {{ r.previousQueue || '—' }}</span></div>
            <div class="text-xs text-ink-500 mt-0.5">{{ r.project }} &middot; {{ r.startDate }} &rarr; {{ r.endDate }}</div>
            @if (r.justification) { <div class="text-xs text-ink-400 mt-1 italic">&ldquo;{{ r.justification }}&rdquo;</div> }
          </div>
          <div class="flex items-center gap-2">
            <app-status-chip label="Pending" level="amber"></app-status-chip>
            <button mat-stroked-button color="warn" class="!text-xs" (click)="decide(r, false)">Reject</button>
            <button mat-flat-button color="primary" class="!text-xs" (click)="decide(r, true)">Approve</button>
          </div>
        </div>
      } @empty {
        <div class="p-8 text-center text-sm text-ink-400">No pending requests &mdash; you're all caught up.</div>
      }
    </div>

    @if (decided().length) {
      <h2 class="text-[13px] font-bold text-ink-900 mb-2">Recently decided</h2>
      <div class="surface-card overflow-hidden">
        @for (r of decided(); track r.id) {
          <div class="flex items-center justify-between px-4 py-2.5 border-b border-surface-border last:border-0 gap-3 flex-wrap">
            <div class="text-sm text-ink-700"><strong>{{ r.agentName }}</strong> &rarr; {{ r.project }}@if (r.decisionNote) {<span class="text-ink-400"> &middot; {{ r.decisionNote }}</span>}</div>
            <app-status-chip [label]="r.status === 'Rejected' ? 'Rejected' : 'Approved'" [level]="r.status === 'Rejected' ? 'red' : 'normal'"></app-status-chip>
          </div>
        }
      </div>
    }
  `,
})
export class ReviewComponent {
  private store = inject(CrcStore);
  private ui = inject(UiService);

  pending = computed(() => this.store.movementRequests().filter((r) => r.status === 'Pending'));
  decided = computed(() => this.store.movementRequests().filter((r) => r.decisionNote !== undefined).slice(0, 8));

  async decide(r: MovementRequest, approved: boolean) {
    if (!this.ui.requires('Review/Approve Movement Requests')) return;
    const v = await this.ui.form({
      title: `${approved ? 'Approve' : 'Reject'} ${r.agentName}'s request`,
      subtitle: `${r.project} · ${r.startDate} → ${r.endDate}`,
      icon: approved ? 'task_alt' : 'block', submitLabel: approved ? 'Approve' : 'Reject',
      fields: [{ key: 'note', label: approved ? 'Comment (optional)' : 'Reason', type: 'textarea', required: !approved }],
    });
    if (!v) return;
    this.store.decideRequest(r.id, approved, v['note'] ?? '');
    this.ui.toast(`${r.agentName}'s request ${approved ? 'approved' : 'rejected'} — agent and manager notified.${approved ? ' Queue updated in the directory.' : ''}`);
  }
}
