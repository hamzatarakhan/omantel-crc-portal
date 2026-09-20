import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { MockDataService } from '../../../core/services/mock-data.service';
import { Agent } from '../../../core/models/domain';
import { StatusLevel } from '../../../core/models/status';

@Component({
  selector: 'app-agent-profile',
  standalone: true,
  imports: [CommonModule, MatTabsModule, MatIconModule, PageHeaderComponent, StatusChipComponent],
  template: `
    @if (agent) {
      <app-page-header
        [title]="agent.name"
        [subtitle]="'Employee ID ' + agent.employeeId + ' · ' + agent.queue + ' · ' + agent.vendor"
        [breadcrumbs]="[{ label: 'CSR Management', link: '/csr/directory' }, { label: 'Team & Agent Directory', link: '/csr/directory' }, { label: agent.name }]"
      >
        <app-status-chip [label]="agent.leaveType || agent.status" [level]="level"></app-status-chip>
      </app-page-header>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Degree</div><div class="text-sm font-medium mt-0.5">{{ agent.degree }}</div></div>
        <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Nationality</div><div class="text-sm font-medium mt-0.5">{{ agent.nationality }}</div></div>
        <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Join Date</div><div class="text-sm font-medium mt-0.5">{{ agent.joinDate }}</div></div>
        <div class="surface-card px-4 py-3"><div class="text-xs text-ink-400">Vendor</div><div class="text-sm font-medium mt-0.5">{{ agent.vendor }}</div></div>
      </div>

      <mat-tab-group>
        <mat-tab label="ID & Compliance">
          <div class="pt-4 flex items-center gap-3 surface-card p-4 max-w-md">
            <mat-icon class="!text-ink-400">badge</mat-icon>
            <div>
              <div class="text-sm font-medium text-ink-700">ID Card on file</div>
              <div class="text-xs text-ink-400">OCR extracted &middot; Name (EN/AR) and ID number verified</div>
            </div>
          </div>
        </mat-tab>
        <mat-tab label="Team History">
          <div class="pt-4 text-sm text-ink-700 space-y-2">
            <p>{{ agent.joinDate }} &mdash; Joined {{ agent.queue }} via {{ agent.vendor }}</p>
            <p class="text-xs text-ink-400">No further team changes recorded.</p>
          </div>
        </mat-tab>
        <mat-tab label="Leave Calendar">
          <div class="pt-4 text-sm text-ink-700">Current status: <span class="font-medium">{{ agent.leaveType || agent.status }}</span></div>
        </mat-tab>
        <mat-tab label="Performance Summary">
          <div class="pt-4 text-sm text-ink-700 space-y-1">
            <p>Attendance: <span class="font-medium">94%</span></p>
            <p>Avg. Call Resolution: <span class="font-medium">4.6 min</span></p>
            <p>CSAT: <span class="font-medium">88%</span></p>
          </div>
        </mat-tab>
      </mat-tab-group>
    }
  `,
})
export class AgentProfileComponent {
  agent?: Agent;
  level: StatusLevel = 'neutral';

  constructor(private route: ActivatedRoute, private data: MockDataService) {
    const id = this.route.snapshot.paramMap.get('id');
    const all = this.data.getAgents(48);
    this.agent = all.find((a) => a.id === id) || all[0];
    this.level = this.agent?.status === 'Present' ? 'normal' : this.agent?.status === 'On Leave' ? 'amber' : this.agent?.status === 'Off' ? 'neutral' : 'red';
  }
}
