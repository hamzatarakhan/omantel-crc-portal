import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { MovementAnnouncement } from '../../../core/models/domain';

import { RequiresDirective } from '../../../shared/directives/requires.directive';

@Component({
  selector: 'app-announcements',
  standalone: true,
  imports: [RequiresDirective, CommonModule, MatButtonModule, MatIconModule, PageHeaderComponent, StatusChipComponent],
  template: `
    <app-page-header
      title="Movement Announcements"
      subtitle="Post an internal project movement opportunity for eligible agents"
      [breadcrumbs]="[{ label: 'Internal Project Movement', link: '/movement/dashboard' }, { label: 'Announcements' }]"
    >
      <button mat-flat-button color="primary" (click)="create()" appRequires="Create Movement Announcement"><mat-icon class="!text-base !mr-1">campaign</mat-icon>New Announcement</button>
    </app-page-header>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      @for (a of items(); track a.id) {
        <div class="surface-card p-4 flex flex-col gap-2">
          <div class="flex items-start justify-between gap-2">
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
            <span>{{ a.applicants }} applicant{{ a.applicants === 1 ? '' : 's' }}</span>
            <span>Deadline {{ a.deadline }}</span>
          </div>
          <div class="flex items-center gap-1.5 flex-wrap pt-1">
            <button mat-stroked-button class="!text-xs" [disabled]="a.status !== 'Open'" (click)="apply(a)">Apply as agent</button>
            <button mat-stroked-button class="!text-xs" (click)="copyLink(a)"><mat-icon class="!text-sm !mr-1">link</mat-icon>Copy link</button>
            <button mat-button class="!text-xs" (click)="toggle(a)" appRequires="Create Movement Announcement">{{ a.status === 'Open' ? 'Close' : 'Reopen' }}</button>
          </div>
        </div>
      }
    </div>
  `,
})
export class AnnouncementsComponent {
  private store = inject(CrcStore);
  private ui = inject(UiService);
  private router = inject(Router);

  items = computed(() => this.store.announcements());

  async create() {
    if (!this.ui.requires('Create Movement Announcement')) return;
    const v = await this.ui.form({
      title: 'New movement announcement', subtitle: 'Eligible agents are notified and get a unique apply link', icon: 'campaign', submitLabel: 'Publish',
      values: { durationMonths: 3 },
      fields: [
        { key: 'projectName', label: 'Project name', required: true, placeholder: 'e.g. Retention Growth Squad' },
        { key: 'targetQueue', label: 'Target queue', type: 'select', required: true, options: this.store.agents().map((a) => a.queue).filter((q, i, arr) => arr.indexOf(q) === i).sort() },
        { key: 'durationMonths', label: 'Duration (months)', type: 'number', min: 1, max: 12, required: true },
        { key: 'skills', label: 'Skills required', placeholder: 'Comma-separated, e.g. Upselling, Objection Handling' },
      ],
    });
    if (!v) return;
    const ann = this.store.addAnnouncement({
      projectName: v['projectName'], targetQueue: v['targetQueue'], durationMonths: Number(v['durationMonths']) || 3,
      skills: String(v['skills'] || '').split(',').map((s) => s.trim()).filter(Boolean),
    });
    this.ui.toast(`"${ann.projectName}" published and emailed to eligible agents.`);
  }

  apply(a: MovementAnnouncement) {
    this.router.navigate(['/movement/apply'], { queryParams: { announcement: a.id } });
  }

  copyLink(a: MovementAnnouncement) {
    const url = `${location.origin}${location.pathname.split('/movement')[0].replace(/\/$/, '')}/movement/apply?announcement=${a.id}`;
    navigator.clipboard?.writeText(url);
    this.ui.toast('Apply link copied — this is the link agents receive by email.');
  }

  async toggle(a: MovementAnnouncement) {
    if (!this.ui.requires('Create Movement Announcement')) return;
    this.store.toggleAnnouncement(a.id);
    this.ui.toast(`"${a.projectName}" ${a.status === 'Open' ? 'closed to new applications' : 'reopened'}.`);
  }
}
