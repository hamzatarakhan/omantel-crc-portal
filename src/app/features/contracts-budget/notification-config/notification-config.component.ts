import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
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
  imports: [CommonModule, FormsModule, MatSlideToggleModule, MatButtonModule, MatIconModule, PageHeaderComponent, StatusChipComponent],
  template: `
    <app-page-header
      title="Notification Configuration"
      subtitle="Configure expiry alert thresholds, channels, recipients, and templates"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Notification Configuration' }]"
    >
      <button mat-flat-button color="primary" (click)="showForm.set(!showForm())">
        <mat-icon class="!text-base !mr-1">{{ showForm() ? 'close' : 'add' }}</mat-icon>
        {{ showForm() ? 'Cancel' : 'New Rule' }}
      </button>
    </app-page-header>

    @if (showForm()) {
      <div class="surface-card p-5 mb-4 flex flex-col gap-4 max-w-xl">
        <div>
          <label class="text-sm font-medium text-ink-700 block mb-1.5">Contract Type</label>
          <input [(ngModel)]="draft.contractType" placeholder="e.g. All Contracts" class="w-full px-3 py-2 text-sm rounded-lg border border-surface-border focus:outline-none focus:border-brand-400 transition-colors" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="text-sm font-medium text-ink-700 block mb-1.5">Days Before Expiry</label>
            <input type="number" [(ngModel)]="draft.thresholdDays" min="1" class="w-full px-3 py-2 text-sm rounded-lg border border-surface-border focus:outline-none focus:border-brand-400 transition-colors" />
          </div>
          <div>
            <label class="text-sm font-medium text-ink-700 block mb-1.5">Channel</label>
            <input [(ngModel)]="draft.channel" placeholder="e.g. Email + In-App" class="w-full px-3 py-2 text-sm rounded-lg border border-surface-border focus:outline-none focus:border-brand-400 transition-colors" />
          </div>
        </div>
        <div>
          <label class="text-sm font-medium text-ink-700 block mb-1.5">Recipients</label>
          <input [(ngModel)]="draft.recipients" placeholder="e.g. Contract Management Team" class="w-full px-3 py-2 text-sm rounded-lg border border-surface-border focus:outline-none focus:border-brand-400 transition-colors" />
        </div>
        <button mat-flat-button color="primary" class="self-start" [disabled]="!draft.contractType || !draft.thresholdDays" (click)="addRule()">Create Rule</button>
      </div>
    }

    <div class="grid gap-3">
      @for (rule of rules(); track rule.id) {
        <div class="surface-card p-4 flex items-center justify-between flex-wrap gap-3">
          <div class="flex items-center gap-4">
            <mat-slide-toggle [checked]="rule.active" (change)="toggleActive(rule)"></mat-slide-toggle>
            <div>
              <div class="text-sm font-medium text-ink-900">{{ rule.contractType }} &middot; {{ rule.thresholdDays }} days before expiry</div>
              <div class="text-xs text-ink-400 mt-0.5">{{ rule.channel }} &middot; Recipients: {{ rule.recipients }}</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <app-status-chip [label]="rule.active ? 'Active' : 'Inactive'" [level]="rule.active ? 'normal' : 'neutral'"></app-status-chip>
            <button mat-stroked-button class="!text-xs" (click)="sendTest(rule)">Send Test</button>
          </div>
        </div>
      }
    </div>
  `,
})
export class NotificationConfigComponent {
  private snack = inject(MatSnackBar);

  rules = signal<NotificationRule[]>([
    { id: '1', contractType: 'All Contracts', thresholdDays: 60, channel: 'Email', recipients: 'Contract Management Team', active: true },
    { id: '2', contractType: 'All Contracts', thresholdDays: 30, channel: 'Email + In-App', recipients: 'Contract Management Team', active: true },
    { id: '3', contractType: 'All Contracts', thresholdDays: 15, channel: 'Email + SMS + In-App', recipients: 'Contract Management Manager', active: true },
    { id: '4', contractType: 'Manpower Outsourcing', thresholdDays: 5, channel: 'SMS + In-App', recipients: 'Senior Management (Escalation)', active: true },
    { id: '5', contractType: 'IT Support', thresholdDays: 45, channel: 'Email', recipients: 'Procurement / Finance', active: false },
  ]);

  showForm = signal(false);
  draft: Partial<NotificationRule> = { channel: 'Email', recipients: '' };

  toggleActive(rule: NotificationRule) {
    this.rules.update((list) => list.map((r) => (r.id === rule.id ? { ...r, active: !r.active } : r)));
  }

  sendTest(rule: NotificationRule) {
    this.snack.open(`Test notification sent via ${rule.channel} to ${rule.recipients}.`, 'Dismiss', { duration: 3000 });
  }

  addRule() {
    if (!this.draft.contractType || !this.draft.thresholdDays) return;
    const rule: NotificationRule = {
      id: crypto.randomUUID(),
      contractType: this.draft.contractType,
      thresholdDays: Number(this.draft.thresholdDays),
      channel: this.draft.channel || 'Email',
      recipients: this.draft.recipients || 'Contract Management Team',
      active: true,
    };
    this.rules.update((list) => [rule, ...list]);
    this.draft = { channel: 'Email', recipients: '' };
    this.showForm.set(false);
    this.snack.open('Notification rule created.', 'Dismiss', { duration: 3000 });
  }
}
