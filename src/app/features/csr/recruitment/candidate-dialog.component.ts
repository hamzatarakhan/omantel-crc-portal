import { Component, Inject, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { CrcStore, INTERVIEW_QUESTIONS } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { CandidateStatus } from '../../../core/models/domain';

const FIELD = 'w-full px-3 py-2 text-sm rounded-lg border border-surface-border bg-white focus:outline-none focus:border-brand-400 transition-colors';

@Component({
  selector: 'app-candidate-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatIconModule, StatusChipComponent],
  template: `
    @if (cand(); as c) {
      <div class="w-full">
        <div class="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-surface-border">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><mat-icon>person_search</mat-icon></div>
            <div class="min-w-0">
              <h2 class="text-base font-bold text-ink-900 truncate">{{ c.name }}</h2>
              <p class="text-xs text-ink-400 mt-0.5">{{ c.department }} &middot; {{ c.vendor }} &middot; applied {{ c.appliedDate }}</p>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <app-status-chip [label]="c.status" [level]="level(c.status)"></app-status-chip>
            <button class="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:bg-surface-subtle hover:text-ink-700" (click)="ref.close()"><mat-icon>close</mat-icon></button>
          </div>
        </div>

        <div class="px-6 py-5 grid grid-cols-1 lg:grid-cols-5 gap-6 max-h-[70vh] overflow-y-auto content-start">
          <div class="lg:col-span-2 flex flex-col gap-5">
          <section>
            <h3 class="text-[13px] font-bold text-ink-900 mb-2">CV</h3>
            <div class="flex items-center gap-3">
              <mat-icon class="!text-ink-400">description</mat-icon>
              <span class="text-sm text-ink-700 flex-1 truncate">{{ c.cv || 'No CV uploaded yet' }}</span>
              <label class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-surface-border bg-white hover:border-brand-300 cursor-pointer transition-colors">
                {{ c.cv ? 'Replace' : 'Upload CV' }}<input type="file" accept=".pdf,.doc,.docx" class="hidden" (change)="cv($event)" />
              </label>
            </div>
          </section>

          <section>
            <h3 class="text-[13px] font-bold text-ink-900 mb-2">Interview</h3>
            <div class="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-3">
              <div><label class="text-xs text-ink-500 block mb-1">Date</label><input type="date" class="${FIELD}" [(ngModel)]="date" /></div>
              <div><label class="text-xs text-ink-500 block mb-1">Time</label><input type="time" class="${FIELD}" [(ngModel)]="time" /></div>
              <div><label class="text-xs text-ink-500 block mb-1">Interviewer</label><input class="${FIELD}" [(ngModel)]="interviewer" placeholder="Vendor recruiter" /></div>
            </div>
            <button class="mt-3 px-3.5 py-2 text-sm font-semibold rounded-lg border border-surface-border bg-white text-ink-700 hover:border-brand-300 disabled:opacity-40 transition-colors" [disabled]="!date || !time || !interviewer" (click)="schedule()">
              {{ c.interview ? 'Reschedule interview' : 'Schedule interview' }}
            </button>
            @if (c.interview) {
              <p class="text-xs text-ink-500 mt-2">Scheduled for <strong>{{ c.interview.date }} {{ c.interview.time }}</strong> with {{ c.interview.interviewer }}{{ c.interview.completed ? ' · scored' : '' }}.</p>
            }
          </section>
          </div>

          <section class="lg:col-span-3">
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-[13px] font-bold text-ink-900">Scored questions</h3>
              <span class="text-xs font-semibold" [class]="answered() ? 'text-brand-700' : 'text-ink-400'">{{ total() }} / {{ max }} &middot; {{ percent() }}%</span>
            </div>
            @if (!c.interview) {
              <p class="text-xs text-ink-400 mb-2">Schedule the interview first, then score each question from 1 (weak) to 5 (excellent).</p>
            }
            <div class="flex flex-col divide-y divide-surface-border border border-surface-border rounded-xl" [class.opacity-50]="!c.interview" [class.pointer-events-none]="!c.interview">
              @for (q of questions; track q.id) {
                <div class="flex items-center gap-3 px-3.5 py-2.5">
                  <div class="flex-1 min-w-0">
                    <div class="text-[10.5px] font-bold uppercase tracking-wide text-ink-400">{{ q.category }}</div>
                    <div class="text-[13px] text-ink-800">{{ q.text }}</div>
                  </div>
                  <div class="flex gap-1 shrink-0">
                    @for (n of [1, 2, 3, 4, 5]; track n) {
                      <button (click)="setScore(q.id, n)" class="w-7 h-7 rounded-md text-xs font-bold border transition-colors" [class]="(scores()[q.id] || 0) === n ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-ink-500 border-surface-border hover:border-brand-300'">{{ n }}</button>
                    }
                  </div>
                </div>
              }
            </div>
            <textarea class="${FIELD} mt-3" rows="2" placeholder="Interview notes (optional)" [(ngModel)]="notes" [disabled]="!c.interview"></textarea>
            <button class="mt-3 px-3.5 py-2 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 transition-colors" [disabled]="!c.interview || !allAnswered()" (click)="saveScores()">Save scores</button>
          </section>
        </div>

        <div class="flex items-center justify-between gap-2 px-6 py-4 border-t border-surface-border bg-surface-subtle flex-wrap">
          <span class="text-xs text-ink-500">Decision — score {{ c.score }}/100</span>
          <div class="flex items-center gap-2">
            <button class="px-3.5 py-2 text-sm font-semibold rounded-lg text-status-red border border-red-100 bg-white hover:bg-red-50 transition-colors" (click)="decide('Rejected')">Reject</button>
            <button class="px-3.5 py-2 text-sm font-semibold rounded-lg border border-surface-border bg-white text-ink-700 hover:border-brand-300 transition-colors" (click)="decide('Shortlisted')">Shortlist</button>
            <button class="px-3.5 py-2 text-sm font-semibold rounded-lg bg-status-normal text-white hover:opacity-90 disabled:opacity-40 transition" [disabled]="c.status === 'Hired' || !c.interview?.completed" (click)="decide('Hired')">Hire</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class CandidateDialogComponent {
  private store = inject(CrcStore);
  private ui = inject(UiService);

  questions = INTERVIEW_QUESTIONS;
  max = INTERVIEW_QUESTIONS.length * 5;
  cand = computed(() => this.store.candidates().find((c) => c.id === this.data.id));

  date = '';
  time = '10:00';
  interviewer = '';
  notes = '';
  scores = signal<Record<string, number>>({});
  total = computed(() => Object.values(this.scores()).reduce((s, v) => s + v, 0));
  answered = computed(() => Object.keys(this.scores()).length);
  allAnswered = computed(() => this.answered() === this.questions.length);
  percent = computed(() => Math.round((this.total() / this.max) * 100));

  constructor(@Inject(MAT_DIALOG_DATA) public data: { id: string }, public ref: MatDialogRef<CandidateDialogComponent>) {
    const c = this.cand();
    if (c?.interview) {
      this.date = c.interview.date;
      this.time = c.interview.time || '10:00';
      this.interviewer = c.interview.interviewer;
      this.notes = c.interview.notes;
      this.scores.set({ ...c.interview.scores });
    }
  }

  level(s: CandidateStatus) {
    return s === 'Hired' ? 'normal' : s === 'Shortlisted' ? 'info' : s === 'Rejected' ? 'red' : s === 'Interview Scheduled' ? 'amber' : 'neutral';
  }

  cv(ev: Event) {
    if (!this.ui.requires('Manage Recruitment')) return;
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    this.store.attachCv(this.data.id, f.name);
    this.ui.toast('CV stored on the candidate record.');
  }

  schedule() {
    if (!this.ui.requires('Manage Recruitment')) return;
    this.store.scheduleInterview(this.data.id, this.date, this.time, this.interviewer);
    this.ui.toast('Interview scheduled — the vendor recruiter has been notified.');
  }

  setScore(qid: string, n: number) {
    this.scores.update((s) => ({ ...s, [qid]: n }));
  }

  saveScores() {
    if (!this.ui.requires('Manage Recruitment')) return;
    const score = this.store.saveInterviewScores(this.data.id, this.scores(), this.notes);
    this.ui.toast(`Scores saved — ${score}/100.`);
  }

  async decide(status: 'Shortlisted' | 'Rejected' | 'Hired') {
    if (!this.ui.requires('Manage Recruitment')) return;
    const c = this.cand();
    if (!c) return;
    const ok = await this.ui.confirm({
      title: `${status === 'Hired' ? 'Hire' : status === 'Rejected' ? 'Reject' : 'Shortlist'} ${c.name}?`,
      message: status === 'Hired' ? 'The candidate becomes an agent in the Team & Agent Directory.' : status === 'Rejected' ? 'The candidate will be marked rejected.' : 'The candidate moves to the shortlist.',
      confirmLabel: status === 'Hired' ? 'Hire' : status === 'Rejected' ? 'Reject' : 'Shortlist',
      danger: status === 'Rejected',
    });
    if (!ok) return;
    this.store.decideCandidate(this.data.id, status);
    this.ui.toast(status === 'Hired' ? `${c.name} hired and added to the directory.` : `${c.name} marked ${status}.`);
  }
}
