import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';

interface NotificationRule {
  id: string;
  contractType: string;
  thresholdDays: number;
  channel: string;
  recipients: string;
  active: boolean;
}

@Component({
  selector: 'app-notification-config',
  standalone: true,
  imports: [CommonModule, MatSlideToggleModule, MatButtonModule, MatIconModule, PageHeaderComponent, StatusChipComponent],
  template: `
    <app-page-header
      title="Notification Configuration"
      subtitle="Configure expiry alert thresholds, channels, recipients, and templates"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Notification Configuration' }]"
    >
      <button mat-flat-button color="primary"><mat-icon class="!text-base !mr-1">add</mat-icon>New Rule</button>
    </app-page-header>

    <div class="grid gap-3">
      @for (rule of rules; track rule.id) {
        <div class="surface-card p-4 flex items-center justify-between flex-wrap gap-3">
          <div class="flex items-center gap-4">
            <mat-slide-toggle [checked]="rule.active"></mat-slide-toggle>
            <div>
              <div class="text-sm font-medium text-ink-900">{{ rule.contractType }} &middot; {{ rule.thresholdDays }} days before expiry</div>
              <div class="text-xs text-ink-400 mt-0.5">{{ rule.channel }} &middot; Recipients: {{ rule.recipients }}</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <app-status-chip [label]="rule.active ? 'Active' : 'Inactive'" [level]="rule.active ? 'normal' : 'neutral'"></app-status-chip>
            <button mat-stroked-button class="!text-xs">Send Test</button>
          </div>
        </div>
      }
    </div>
  `,
})
export class NotificationConfigComponent {
  rules: NotificationRule[] = [
    { id: '1', contractType: 'All Contracts', thresholdDays: 60, channel: 'Email', recipients: 'Contract Management Team', active: true },
    { id: '2', contractType: 'All Contracts', thresholdDays: 30, channel: 'Email + In-App', recipients: 'Contract Management Team', active: true },
    { id: '3', contractType: 'All Contracts', thresholdDays: 15, channel: 'Email + SMS + In-App', recipients: 'Contract Management Manager', active: true },
    { id: '4', contractType: 'Manpower Outsourcing', thresholdDays: 5, channel: 'SMS + In-App', recipients: 'Senior Management (Escalation)', active: true },
    { id: '5', contractType: 'IT Support', thresholdDays: 45, channel: 'Email', recipients: 'Procurement / Finance', active: false },
  ];
}
