import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { MockDataService } from '../../../core/services/mock-data.service';
import { MovementAnnouncement } from '../../../core/models/domain';

@Component({
  selector: 'app-announcements',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, PageHeaderComponent, StatusChipComponent],
  template: `
    <app-page-header
      title="Movement Announcements"
      subtitle="Post an internal project movement opportunity for eligible agents"
      [breadcrumbs]="[{ label: 'Internal Project Movement', link: '/movement/dashboard' }, { label: 'Announcements' }]"
    >
      <button mat-flat-button color="primary"><mat-icon class="!text-base !mr-1">campaign</mat-icon>New Announcement</button>
    </app-page-header>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      @for (a of announcements; track a.id) {
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
  announcements: MovementAnnouncement[] = this.data.getMovementAnnouncements();
}
