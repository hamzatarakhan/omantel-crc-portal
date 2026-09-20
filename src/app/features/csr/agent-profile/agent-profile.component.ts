import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { StatusLevel } from '../../../core/models/status';

export const CODE_STYLE: Record<string, string> = {
  P: 'bg-emerald-50 text-status-normal', OFF: 'bg-surface-subtle text-ink-400', A: 'bg-red-50 text-status-red',
  'S/L': 'bg-amber-50 text-status-amber', 'C/L': 'bg-brand-50 text-brand-600', 'M/L': 'bg-brand-50 text-brand-600',
  'P/L': 'bg-brand-50 text-brand-600', SP: 'bg-brand-50 text-brand-600', 'ST/L': 'bg-brand-50 text-brand-600', AS: 'bg-amber-50 text-status-amber',
};

@Component({
  selector: 'app-agent-profile',
  standalone: true,
  imports: [CommonModule, RouterModule, MatTabsModule, MatButtonModule, MatIconModule, PageHeaderComponent, StatusChipComponent],
  template: `
    @if (agent(); as a) {
      <app-page-header
        [title]="a.name"
        [subtitle]="'Employee ID ' + a.employeeId + ' · ' + a.queue + ' · ' + a.vendor"
        [breadcrumbs]="[{ label: 'CSR Management', link: '/csr/directory' }, { label: 'Team & Agent Directory', link: '/csr/directory' }, { label: a.name }]"
      >
        <app-status-chip [label]="a.leaveType || a.status" [level]="level()"></app-status-chip>
        <button mat-stroked-button (click)="recordLeave()"><mat-icon class="!text-base !mr-1">event_available</mat-icon>Record leave / status</button>
      </app-page-header>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Degree</div><div class="text-sm font-medium mt-0.5">{{ a.degree }}</div></div>
        <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Nationality</div><div class="text-sm font-medium mt-0.5">{{ a.nationality }}</div></div>
        <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Join Date</div><div class="text-sm font-medium mt-0.5">{{ a.joinDate }}</div></div>
        <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Vendor</div><div class="text-sm font-medium mt-0.5">{{ a.vendor }}</div></div>
      </div>

      <mat-tab-group>
        <mat-tab label="ID & Compliance">
          <div class="pt-4 max-w-xl flex flex-col gap-3">
            @if (doc(); as d) {
              <div class="surface-card p-4">
                <div class="flex items-center gap-3">
                  <mat-icon class="!text-ink-400">badge</mat-icon>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-ink-700 truncate">{{ d.fileName }}</div>
                    <div class="text-xs text-ink-400">{{ d.status === 'Processing' ? 'Reading the document (OCR)…' : d.status === 'Extracted' ? 'Extracted — please review and confirm' : 'Extracted and verified' }}</div>
                  </div>
                  <app-status-chip [label]="d.status" [level]="d.status === 'Verified' ? 'normal' : d.status === 'Extracted' ? 'amber' : 'info'"></app-status-chip>
                </div>
                @if (d.status !== 'Processing') {
                  <div class="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-surface-border text-sm">
                    <div><div class="text-xs text-ink-400">Name</div><div class="font-medium text-ink-900">{{ d.name }}</div></div>
                    <div><div class="text-xs text-ink-400">ID number</div><div class="font-medium text-ink-900">{{ d.idNumber }}</div></div>
                    <div><div class="text-xs text-ink-400">Expiry</div><div class="font-medium text-ink-900">{{ d.expiry }}</div></div>
                  </div>
                  @if (d.status === 'Extracted') {
                    <button mat-flat-button color="primary" class="mt-4" (click)="verify(a.id)"><mat-icon class="!text-base !mr-1">verified</mat-icon>Confirm details</button>
                  }
                }
              </div>
            } @else {
              <div class="surface-card p-4 text-sm text-ink-500">No ID card on file for this agent.</div>
            }
            <label class="inline-flex items-center gap-2 self-start px-3.5 py-2 text-sm font-semibold rounded-lg border border-surface-border bg-white text-ink-700 hover:border-brand-300 cursor-pointer transition-colors">
              <mat-icon class="!text-lg !text-brand-600">upload_file</mat-icon>{{ doc() ? 'Replace ID card' : 'Upload ID card' }}
              <input type="file" accept="image/*,.pdf" class="hidden" (change)="upload(a.id, $event)" />
            </label>
            <p class="text-xs text-ink-400">Supported: JPG, PNG or PDF. The name and ID number are read automatically and must be confirmed by a person before they are trusted.</p>
          </div>
        </mat-tab>

        <mat-tab label="Team History">
          <div class="pt-4 text-sm text-ink-700 space-y-2 max-w-xl">
            @for (m of moves(); track m.id) {
              <p>{{ m.startDate }} &mdash; Moved to <strong>{{ m.project }}</strong> ({{ m.status }}){{ m.endDate ? ', until ' + m.endDate : '' }}</p>
            }
            <p>{{ a.joinDate }} &mdash; Joined {{ a.queue }} via {{ a.vendor }}</p>
            @if (!moves().length) { <p class="text-xs text-ink-400">No team changes recorded. Approved movement requests will appear here.</p> }
          </div>
        </mat-tab>

        <mat-tab label="Leave Calendar">
          <div class="pt-4">
            <div class="flex gap-1.5 flex-wrap">
              @for (code of codes(); track $index) {
                <div class="w-14 text-center">
                  <div class="text-[10px] text-ink-400 mb-1">{{ days[$index].slice(5) }}</div>
                  <div class="rounded-lg py-1.5 text-xs font-bold" [class]="style(code)">{{ code }}</div>
                </div>
              }
            </div>
            <p class="text-sm text-ink-700 mt-4">Current status: <span class="font-medium">{{ a.leaveType || a.status }}</span></p>
            <p class="text-xs text-ink-400 mt-1">Edit the whole team's sheet on the <a class="text-brand-600 font-medium" routerLink="/csr/leave">Leave Management</a> screen.</p>
          </div>
        </mat-tab>

        <mat-tab label="Performance Summary">
          @if (perf(); as p) {
            <div class="pt-4 grid grid-cols-3 gap-4 max-w-xl">
              <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Attendance (14 days)</div><div class="text-lg font-extrabold mt-0.5">{{ p.attendancePct }}%</div></div>
              <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Avg. call resolution</div><div class="text-lg font-extrabold mt-0.5">{{ p.avgCallResolutionMin.toFixed(1) }} min</div></div>
              <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">CSAT</div><div class="text-lg font-extrabold mt-0.5">{{ p.csatPct }}%</div></div>
            </div>
          }
        </mat-tab>
      </mat-tab-group>
    } @else {
      <div class="surface-card p-8 text-center text-sm text-ink-500">This agent could not be found. <a class="text-brand-600 font-medium" routerLink="/csr/directory">Back to the directory</a></div>
    }
  `,
})
export class AgentProfileComponent {
  private store = inject(CrcStore);
  private ui = inject(UiService);
  private id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('id'))));

  days = this.store.attendanceDays;
  agent = computed(() => this.store.agents().find((a) => a.id === this.id()));
  doc = computed(() => this.store.idDocs()[this.id() ?? '']);
  codes = computed(() => this.store.attendance()[this.id() ?? ''] ?? []);
  perf = computed(() => this.store.performance().find((p) => p.agentId === this.id()));
  moves = computed(() => this.store.movementRequests().filter((m) => m.agentId === this.id() && (m.status === 'Active' || m.status === 'Ending Soon' || m.status === 'Expired')));
  level = computed<StatusLevel>(() => {
    const s = this.agent()?.status;
    return s === 'Present' ? 'normal' : s === 'On Leave' ? 'amber' : s === 'Off' ? 'neutral' : 'red';
  });

  style(code: string) {
    return CODE_STYLE[code] ?? 'bg-surface-subtle text-ink-500';
  }

  upload(agentId: string, ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.store.uploadId(agentId, file.name);
    setTimeout(() => {
      this.store.finishOcr(agentId);
      this.ui.toast('ID card read — please confirm the extracted details.');
    }, 1500);
    (ev.target as HTMLInputElement).value = '';
  }

  verify(agentId: string) {
    this.store.verifyId(agentId);
    this.ui.toast('ID details confirmed.');
  }

  async recordLeave() {
    if (!this.ui.requires('Manage Leave & Attendance')) return;
    const a = this.agent();
    if (!a) return;
    const v = await this.ui.form({
      title: `Record status for ${a.name}`, subtitle: "Reclassifies today's code — the source WFO record is not altered", icon: 'event_available', submitLabel: 'Save',
      values: { code: 'S/L' },
      fields: [
        { key: 'code', label: 'Attendance / leave code', type: 'select', required: true, options: [{ value: 'P', label: 'P — Presence' }, { value: 'OFF', label: 'OFF — Off day' }, { value: 'A', label: 'A — Absence' }, { value: 'S/L', label: 'S/L — Sick leave' }, { value: 'C/L', label: 'C/L — Annual / exception leave' }, { value: 'M/L', label: 'M/L — Maternity leave' }, { value: 'P/L', label: 'P/L — Paternity leave' }, { value: 'SP', label: 'SP — Compassionate / family leave' }, { value: 'ST/L', label: 'ST/L — Study leave' }, { value: 'AS', label: 'AS — Accompanying sick family member' }] },
        { key: 'note', label: 'Note (optional)', type: 'textarea' },
      ],
    });
    if (!v) return;
    this.store.recordLeave(a.id, v['code'], v['note']);
    this.ui.toast(`${a.name} updated to ${v['code']}.`);
  }
}
