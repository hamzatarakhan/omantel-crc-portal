import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { MovementRequest } from '../../../core/models/domain';

const FIELD = 'w-full px-3 py-2.5 text-sm rounded-lg border border-surface-border bg-white focus:outline-none focus:border-brand-400 transition-colors placeholder:text-ink-400';

@Component({
  selector: 'app-apply',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatButtonModule, MatIconModule, PageHeaderComponent],
  template: `
    <app-page-header
      [title]="'Agent Application — ' + (announcement()?.projectName || 'Select a project')"
      subtitle="Reached via the unique link from the movement announcement email"
      [breadcrumbs]="[{ label: 'Internal Project Movement', link: '/movement/dashboard' }, { label: 'Apply for Movement' }]"
    ></app-page-header>

    @if (submitted(); as req) {
      <div class="surface-card p-8 max-w-xl text-center">
        <div class="w-12 h-12 rounded-full bg-emerald-50 text-status-normal flex items-center justify-center mx-auto mb-3">
          <mat-icon class="!text-2xl">check</mat-icon>
        </div>
        <h3 class="text-sm font-bold text-ink-900">Application submitted — {{ req.id }}</h3>
        <p class="text-xs text-ink-500 mt-1">{{ req.agentName }} applied to <strong>{{ req.project }}</strong>. You and your current manager will be notified once this request is reviewed.</p>
        <div class="flex justify-center gap-2 mt-5">
          <a mat-stroked-button routerLink="/movement/dashboard">Track on the dashboard</a>
          <a mat-flat-button color="primary" routerLink="/movement/review">Open review queue</a>
        </div>
        <button class="mt-3 text-xs text-brand-600 font-semibold" (click)="another()">Submit another application</button>
      </div>
    } @else {
      <div class="surface-card p-6 max-w-xl flex flex-col gap-5">
        <div>
          <label class="text-sm font-medium text-ink-700 block mb-1.5">Movement opportunity <span class="text-status-red">*</span></label>
          <div class="relative">
            <select class="${FIELD} pr-9 appearance-none" [ngModel]="announcementId()" (ngModelChange)="announcementId.set($event)">
              @for (a of open(); track a.id) { <option [value]="a.id">{{ a.projectName }} — {{ a.targetQueue }} ({{ a.durationMonths }} mo.)</option> }
            </select>
            <mat-icon class="!text-lg !text-ink-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">expand_more</mat-icon>
          </div>
          @if (!open().length) { <p class="text-xs text-status-red mt-1">There are no open movement announcements right now.</p> }
        </div>

        <div>
          <label class="text-sm font-medium text-ink-700 block mb-1.5">Employee ID <span class="text-status-red">*</span></label>
          <input class="${FIELD}" [class.!border-status-red]="agentId() && !agent()" [ngModel]="agentId()" (ngModelChange)="agentId.set($event)" placeholder="e.g. 3005" />
          @if (agent(); as a) {
            <p class="text-xs text-status-normal font-medium mt-1.5">{{ a.name }} &middot; {{ a.queue }} &middot; {{ a.vendor }}</p>
          } @else if (agentId()) {
            <p class="text-xs text-status-red mt-1.5">No agent found with that employee ID.</p>
          }
        </div>

        <div>
          <label class="text-sm font-medium text-ink-700 block mb-1.5">Contact information <span class="text-status-red">*</span></label>
          <input class="${FIELD}" [ngModel]="contact()" (ngModelChange)="contact.set($event)" placeholder="Email or phone number" />
        </div>

        <div>
          <label class="text-sm font-medium text-ink-700 block mb-1.5">Desired movement duration <span class="text-status-red">*</span></label>
          <div class="relative">
            <select class="${FIELD} pr-9 appearance-none" [ngModel]="duration()" (ngModelChange)="duration.set(+$event)">
              <option [value]="0" disabled>Select duration</option>
              @for (m of durations(); track m) { <option [value]="m">{{ m }} month{{ m > 1 ? 's' : '' }}</option> }
            </select>
            <mat-icon class="!text-lg !text-ink-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">expand_more</mat-icon>
          </div>
        </div>

        <div>
          <label class="text-sm font-medium text-ink-700 block mb-1.5">Justification <span class="text-status-red">*</span></label>
          <textarea rows="4" class="${FIELD} resize-y" [ngModel]="justification()" (ngModelChange)="justification.set($event)" placeholder="Briefly explain why you're a fit for this movement"></textarea>
        </div>

        <button mat-flat-button color="primary" class="self-start" [disabled]="!valid()" (click)="submit()">Submit Application</button>
      </div>
    }
  `,
})
export class ApplyComponent {
  private store = inject(CrcStore);
  private ui = inject(UiService);
  private queryId = toSignal(inject(ActivatedRoute).queryParamMap.pipe(map((p) => p.get('announcement'))));

  open = computed(() => this.store.announcements().filter((a) => a.status === 'Open'));
  announcementId = signal('');
  agentId = signal('');
  contact = signal('');
  duration = signal(0);
  justification = signal('');
  submitted = signal<MovementRequest | undefined>(undefined);

  announcement = computed(() => this.store.announcements().find((a) => a.id === (this.announcementId() || this.queryId())) ?? this.open()[0]);
  durations = computed(() => Array.from({ length: this.announcement()?.durationMonths ?? 12 }, (_, i) => i + 1));
  agent = computed(() => this.store.agents().find((a) => a.employeeId === this.agentId().trim() || a.id === this.agentId().trim()));
  valid = computed(() => !!this.announcement() && !!this.agent() && this.contact().trim() !== '' && this.duration() > 0 && this.justification().trim() !== '');

  constructor() {
    queueMicrotask(() => this.announcementId.set(this.queryId() && this.open().some((a) => a.id === this.queryId()) ? this.queryId()! : this.open()[0]?.id ?? ''));
  }

  submit() {
    if (!this.valid()) return;
    const req = this.store.submitApplication({ announcementId: this.announcement()!.id, agentId: this.agent()!.id, contact: this.contact(), duration: this.duration(), justification: this.justification() });
    if (!req) return;
    this.submitted.set(req);
    this.ui.toast('Application submitted — the reviewer has been notified.');
  }

  another() {
    this.agentId.set('');
    this.contact.set('');
    this.duration.set(0);
    this.justification.set('');
    this.submitted.set(undefined);
  }
}
