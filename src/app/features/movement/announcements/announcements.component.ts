import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { MockDataService } from '../../../core/services/mock-data.service';
import { MovementAnnouncement } from '../../../core/models/domain';

@Component({
  selector: 'app-announcements',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, PageHeaderComponent, StatusChipComponent],
  template: `
    <app-page-header
      title="Movement Announcements"
      subtitle="Post an internal project movement opportunity for eligible agents"
      [breadcrumbs]="[{ label: 'Internal Project Movement', link: '/movement/dashboard' }, { label: 'Announcements' }]"
    >
      <button mat-flat-button color="primary" (click)="showForm.set(!showForm())">
        <mat-icon class="!text-base !mr-1">{{ showForm() ? 'close' : 'campaign' }}</mat-icon>
        {{ showForm() ? 'Cancel' : 'New Announcement' }}
      </button>
    </app-page-header>

    @if (showForm()) {
      <div class="surface-card p-5 mb-4 flex flex-col gap-4 max-w-xl">
        <div>
          <label class="text-sm font-medium text-ink-700 block mb-1.5">Project Name</label>
          <input [(ngModel)]="draft.projectName" placeholder="e.g. Retention Growth Squad" class="w-full px-3 py-2 text-sm rounded-lg border border-surface-border focus:outline-none focus:border-brand-400 transition-colors" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="text-sm font-medium text-ink-700 block mb-1.5">Target Queue</label>
            <input [(ngModel)]="draft.targetQueue" placeholder="e.g. Retention" class="w-full px-3 py-2 text-sm rounded-lg border border-surface-border focus:outline-none focus:border-brand-400 transition-colors" />
          </div>
          <div>
            <label class="text-sm font-medium text-ink-700 block mb-1.5">Duration (months)</label>
            <input type="number" [(ngModel)]="draft.durationMonths" min="1" max="12" class="w-full px-3 py-2 text-sm rounded-lg border border-surface-border focus:outline-none focus:border-brand-400 transition-colors" />
          </div>
        </div>
        <div>
          <label class="text-sm font-medium text-ink-700 block mb-1.5">Skills Required</label>
          <input [(ngModel)]="draft.skillsInput" placeholder="Comma-separated, e.g. Upselling, Objection Handling" class="w-full px-3 py-2 text-sm rounded-lg border border-surface-border focus:outline-none focus:border-brand-400 transition-colors" />
        </div>
        <button mat-flat-button color="primary" class="self-start" [disabled]="!draft.projectName || !draft.targetQueue" (click)="publish()">Publish Announcement</button>
      </div>
    }

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      @for (a of announcements(); track a.id) {
        <div class="surface-card p-4 flex flex-col gap-2">
          <div class="flex items-start justify-between">
            <h3 class="text-sm font-semibold text-ink-900">{{ a.projectName }}</h3>
            <app-status-chip [label]="a.status" [level]="a.status === 'Open' ? 'normal' : 'neutral'"></app-status-chip>
          </div>
          <p class="text-xs text-ink-500">Target queue: {{ a.targetQueue }} &middot; {{ a.durationMonths }} months</p>
          <div class="flex flex-wrap gap-1">
            @for (skill of a.skillsRequired; track skill) {
              <span class="text-[11px] bg-surface-subtle border border-surface-border rounded-full px-2 py-0.5">{{ skill }}</span>
            }
          </div>
          <div class="flex items-center justify-between text-xs text-ink-400 mt-2 pt-2 border-t border-surface-border">
            <span>{{ a.applicants }} applicants</span>
            <span>Deadline {{ a.deadline }}</span>
          </div>
        </div>
      }
    </div>
  `,
})
export class AnnouncementsComponent {
  private data = inject(MockDataService);
  private snack = inject(MatSnackBar);

  announcements = signal<MovementAnnouncement[]>(this.data.getMovementAnnouncements());

  showForm = signal(false);
  draft: { projectName?: string; targetQueue?: string; durationMonths?: number; skillsInput?: string } = {};

  publish() {
    if (!this.draft.projectName || !this.draft.targetQueue) return;
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 14);
    const announcement: MovementAnnouncement = {
      id: crypto.randomUUID(),
      projectName: this.draft.projectName,
      targetQueue: this.draft.targetQueue,
      durationMonths: Number(this.draft.durationMonths) || 3,
      skillsRequired: (this.draft.skillsInput || '').split(',').map((s) => s.trim()).filter(Boolean),
      applicants: 0,
      status: 'Open',
      postedDate: new Date().toISOString().slice(0, 10),
      deadline: deadline.toISOString().slice(0, 10),
    };
    this.announcements.update((list) => [announcement, ...list]);
    this.draft = {};
    this.showForm.set(false);
    this.snack.open('Announcement published and emailed to eligible agents.', 'Dismiss', { duration: 3000 });
  }
}
