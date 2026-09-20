import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { NotificationRule } from '../../../core/models/domain';

const CHANNELS = ['Email', 'Email + In-App', 'SMS + In-App', 'Email + SMS + In-App'];
const RECIPIENTS = ['Contract Management Team', 'Contract Management Manager', 'Procurement / Finance', 'Senior Management (Escalation)'];

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
      <button mat-flat-button color="primary" (click)="newRule()">
        <mat-icon class="!text-base !mr-1">add</mat-icon>New Rule
      </button>
    </app-page-header>

    <div class="grid gap-3">
      @for (rule of rules(); track rule.id) {
        <div class="surface-card p-4 flex items-center justify-between flex-wrap gap-3">
          <div class="flex items-center gap-4">
            <mat-slide-toggle [checked]="rule.active" (change)="store.toggleNotificationRule(rule.id)"></mat-slide-toggle>
            <div>
              <div class="text-sm font-medium text-ink-900">{{ rule.contractType }} &middot; {{ rule.thresholdDays }} days before expiry</div>
              <div class="text-xs text-ink-400 mt-0.5">{{ rule.channel }} &middot; Recipients: {{ rule.recipients }} &middot; matches {{ matching(rule) }} contract{{ matching(rule) === 1 ? '' : 's' }} now</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <app-status-chip [label]="rule.active ? 'Active' : 'Inactive'" [level]="rule.active ? 'normal' : 'neutral'"></app-status-chip>
            <button mat-stroked-button class="!text-xs" (click)="sendTest(rule)">Send Test</button>
            <button class="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:bg-red-50 hover:text-status-red transition-colors" title="Delete rule" (click)="remove(rule)">
              <mat-icon class="!text-lg">delete_outline</mat-icon>
            </button>
          </div>
        </div>
      } @empty {
        <div class="surface-card p-8 text-center text-sm text-ink-400">No rules configured. Create one to start receiving expiry alerts.</div>
      }
    </div>
  `,
})
export class NotificationConfigComponent {
  store = inject(CrcStore);
  private ui = inject(UiService);

  rules = this.store.notificationRules;
  types = computed(() => ['All Contracts', ...new Set(this.store.contracts().map((c) => c.contractType))]);

  matching(rule: NotificationRule): number {
    return this.store.contracts().filter((c) => (rule.contractType === 'All Contracts' || c.contractType === rule.contractType) && c.daysRemaining >= 0 && c.daysRemaining <= rule.thresholdDays).length;
  }

  async newRule() {
    const v = await this.ui.form({
      title: 'New notification rule',
      subtitle: 'Alerts are sent before a contract reaches its end date',
      icon: 'notifications_active',
      submitLabel: 'Create rule',
      values: { contractType: 'All Contracts', channel: 'Email + In-App', recipients: 'Contract Management Team' },
      fields: [
        { key: 'contractType', label: 'Contract type', type: 'select', options: this.types(), required: true },
        { key: 'thresholdDays', label: 'Days before expiry', type: 'number', min: 1, required: true, placeholder: 'e.g. 30' },
        { key: 'channel', label: 'Channel', type: 'select', options: CHANNELS, required: true },
        { key: 'recipients', label: 'Recipients', type: 'select', options: RECIPIENTS, required: true },
      ],
    });
    if (!v) return;
    this.store.addNotificationRule({ contractType: v['contractType'], thresholdDays: Number(v['thresholdDays']), channel: v['channel'], recipients: v['recipients'] });
    this.ui.toast('Notification rule created.');
  }

  sendTest(rule: NotificationRule) {
    this.store.notify(`Test alert: ${rule.contractType} contracts expire in ${rule.thresholdDays} days.`, `Test via ${rule.channel}`, 'info', '/contracts-budget/notifications');
    this.store.log('Notification Test Sent', rule.contractType, `Test sent via ${rule.channel} to ${rule.recipients}.`);
    this.ui.toast(`Test notification sent via ${rule.channel} to ${rule.recipients}. Check the bell.`);
  }

  async remove(rule: NotificationRule) {
    const ok = await this.ui.confirm({ title: 'Delete this rule?', message: `${rule.contractType} · ${rule.thresholdDays} days before expiry will stop sending alerts.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    this.store.deleteNotificationRule(rule.id);
    this.ui.toast('Rule deleted.');
  }
}
