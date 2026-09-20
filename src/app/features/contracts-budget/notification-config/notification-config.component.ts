import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { RequiresDirective } from '../../../shared/directives/requires.directive';
import { CrcStore } from '../../../core/services/crc-store.service';
import { ContractOps } from '../../../core/services/contract-ops.service';
import { UiService } from '../../../shared/services/ui.service';
import { Contract, NotificationRule } from '../../../core/models/domain';
import { ruleApplies, DEPARTMENT_BY_TYPE } from '../../../core/services/contract-data';
import { NotificationTemplate, PLACEHOLDERS, renderTemplate } from '../../../core/services/contract-monitoring';

const CHANNELS = ['Email', 'SMS', 'In-App'];
const RECIPIENTS = ['Contract owner', 'Contract Management team', 'Contract Management Manager', 'Responsible department', 'Procurement team', 'Finance team', 'Senior management', 'Configured user groups'];
const join = (v: string[] | string, sep: string, order?: string[]) => (Array.isArray(v) ? (order ? order.filter((o) => v.includes(o)) : v).join(sep) : v);

@Component({
  selector: 'app-notification-config',
  standalone: true,
  imports: [CommonModule, MatSlideToggleModule, MatButtonModule, MatIconModule, MatTabsModule, PageHeaderComponent, StatusChipComponent, RequiresDirective],
  template: `
    <app-page-header
      title="Notification Configuration"
      subtitle="Expiry alert rules, message templates and the escalation rule &middot; alerts are generated in the organisation time zone ({{ ops.syncConfig().timezone }})"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Notification Configuration' }]"
    ></app-page-header>

    <mat-tab-group>
      <!-- ================= Alert rules ================= -->
      <mat-tab [label]="'Alert rules (' + rules().length + ')'">
        <div class="pt-4 flex flex-col gap-3">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <p class="text-xs text-ink-500 max-w-3xl">Default thresholds: 60, 30, 15 and 5 days before expiry. Each rule sends one alert per contract, so a contract never receives the same alert twice.</p>
            <button mat-flat-button color="primary" (click)="ruleForm()" appRequires="Manage Notifications"><mat-icon class="!text-base !mr-1">add</mat-icon>New rule</button>
          </div>
          @for (rule of rules(); track rule.id) {
            <div class="surface-card p-4 flex items-center justify-between flex-wrap gap-3">
              <div class="flex items-center gap-4 min-w-0">
                <mat-slide-toggle [checked]="rule.active" (change)="toggle(rule)"></mat-slide-toggle>
                <div class="min-w-0">
                  <div class="text-sm font-medium text-ink-900">{{ rule.contractType }} &middot; {{ rule.thresholdDays }} days before expiry</div>
                  <div class="text-xs text-ink-400 mt-0.5">{{ rule.channel }} &middot; Recipients: {{ rule.recipients }}</div>
                  <div class="text-xs text-ink-400 mt-0.5">Template: {{ templateLabel(rule) }} &middot; Language: {{ languageOf(rule) }} &middot; Vendor: {{ rule.vendor || 'All vendors' }} &middot; Department: {{ rule.department || 'All departments' }} &middot; matches {{ matching(rule) }} contract{{ matching(rule) === 1 ? '' : 's' }} now</div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <app-status-chip [label]="rule.active ? 'Active' : 'Inactive'" [level]="rule.active ? 'normal' : 'neutral'"></app-status-chip>
                <button mat-stroked-button class="!text-xs" (click)="ruleForm(rule)" appRequires="Manage Notifications">Edit</button>
                <button mat-stroked-button class="!text-xs" (click)="sendTest(rule)" appRequires="Manage Notifications">Send test</button>
                <button class="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:bg-red-50 hover:text-status-red transition-colors" title="Delete rule" (click)="remove(rule)"><mat-icon class="!text-lg">delete_outline</mat-icon></button>
              </div>
            </div>
          } @empty {
            <div class="surface-card p-8 text-center text-sm text-ink-400">No rules configured. Create one to start receiving expiry alerts.</div>
          }
        </div>
      </mat-tab>

      <!-- ================= Templates ================= -->
      <mat-tab [label]="'Templates (' + ops.templates().length + ')'">
        <div class="pt-4 flex flex-col gap-3">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <p class="text-xs text-ink-500 max-w-3xl">Placeholders you can use: <span class="font-mono text-[11px]">{{ placeholders }}</span></p>
            <button mat-flat-button color="primary" (click)="templateForm()" appRequires="Manage Notifications"><mat-icon class="!text-base !mr-1">add</mat-icon>New template</button>
          </div>
          @for (t of ops.templates(); track t.id) {
            <div class="surface-card p-4">
              <div class="flex items-start justify-between gap-3 flex-wrap">
                <div class="min-w-0">
                  <div class="text-sm font-semibold text-ink-900 flex items-center gap-2 flex-wrap">{{ t.name }} <app-status-chip [label]="t.purpose" [level]="t.purpose === 'Escalation' ? 'red' : 'amber'"></app-status-chip> <app-status-chip [label]="t.language" level="info"></app-status-chip></div>
                  <div class="text-xs text-ink-500 mt-1"><b>Email subject:</b> <span [attr.dir]="t.language === 'Arabic' ? 'rtl' : null">{{ t.emailSubject }}</span></div>
                  <div class="text-xs text-ink-400 mt-0.5 line-clamp-2" [attr.dir]="t.language === 'Arabic' ? 'rtl' : null">{{ t.emailBody }}</div>
                  <div class="text-xs text-ink-400 mt-1">Used by {{ usedBy(t) }} rule{{ usedBy(t) === 1 ? '' : 's' }}</div>
                </div>
                <div class="flex items-center gap-2">
                  <button mat-stroked-button class="!text-xs" (click)="preview(t)">Preview</button>
                  <button mat-stroked-button class="!text-xs" (click)="templateForm(t)" appRequires="Manage Notifications">Edit</button>
                  <button class="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:bg-red-50 hover:text-status-red transition-colors" title="Delete template" (click)="removeTemplate(t)"><mat-icon class="!text-lg">delete_outline</mat-icon></button>
                </div>
              </div>
            </div>
          }
        </div>
      </mat-tab>

      <!-- ================= Escalation rule ================= -->
      <mat-tab label="Escalation rule">
        <div class="pt-4 grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
          <div class="surface-card px-5 py-4 xl:col-span-2">
            <div class="flex items-center justify-between gap-3 flex-wrap">
              <h3 class="text-[13.5px] font-bold text-ink-900">Escalation of unresolved contracts</h3>
              <button mat-flat-button color="primary" (click)="escalationForm()" appRequires="Manage Escalations"><mat-icon class="!text-base !mr-1">edit</mat-icon>Edit rule</button>
            </div>
            <dl class="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3 mt-4 text-sm">
              <div><dt class="text-xs text-ink-400">Threshold</dt><dd class="font-medium text-ink-900">{{ ops.escalationRule().hours }} hours before expiry</dd></div>
              <div><dt class="text-xs text-ink-400">Applies to</dt><dd class="font-medium text-ink-900">{{ ops.escalationRule().appliesTo.length ? ops.escalationRule().appliesTo.join(', ') : 'All contract types' }}</dd></div>
              <div><dt class="text-xs text-ink-400">Escalated to</dt><dd class="font-medium text-ink-900">{{ ops.escalationRule().recipients }}</dd></div>
            </dl>
            <p class="text-xs text-ink-500 mt-4 leading-relaxed">A contract is <b>unresolved</b> when it is expiring or expired, has not been renewed in the ERP, and no one has recorded a resolution. When it reaches the threshold, CRC escalates it and shows its status (Not required, Pending action, Action in progress, Escalated, Resolved, Closed) on the contract. The contract's own status always comes from the ERP.</p>
          </div>
          <div class="surface-card px-5 py-4">
            <h3 class="text-[13.5px] font-bold text-ink-900">Right now</h3>
            <dl class="grid gap-y-3 mt-3 text-sm">
              <div><dt class="text-xs text-ink-400">Escalated contracts</dt><dd class="font-medium text-status-red">{{ escalated() }}</dd></div>
              <div><dt class="text-xs text-ink-400">Unresolved contracts</dt><dd class="font-medium text-ink-900">{{ unresolved() }}</dd></div>
            </dl>
          </div>
        </div>
      </mat-tab>
    </mat-tab-group>
  `,
})
export class NotificationConfigComponent {
  store = inject(CrcStore);
  ops = inject(ContractOps);
  private ui = inject(UiService);

  placeholders = PLACEHOLDERS.join('  ');
  rules = this.store.notificationRules;
  types = computed(() => [...new Set(this.store.contracts().map((c) => c.contractType))].sort());
  vendors = computed(() => [...new Set(this.store.contracts().map((c) => c.vendorName))].sort());
  departments = computed(() => [...new Set([...this.store.contracts().map((c) => c.department ?? ''), ...Object.values(DEPARTMENT_BY_TYPE)])].filter(Boolean).sort());
  escalated = computed(() => this.ops.active().filter((c) => this.ops.isEscalated(c)).length);
  unresolved = computed(() => this.ops.active().filter((c) => this.ops.isUnresolved(c)).length);

  matching(rule: NotificationRule): number {
    return this.ops.active().filter((c) => ruleApplies({ ...rule, active: true }, c) && c.daysRemaining >= 0 && c.daysRemaining <= rule.thresholdDays).length;
  }
  templateOf(rule: NotificationRule) { return this.ops.templates().find((t) => t.id === rule.templateId); }
  templateLabel(rule: NotificationRule) { return this.templateOf(rule)?.name ?? 'None'; }
  languageOf(rule: NotificationRule) { return this.templateOf(rule)?.language ?? rule.language ?? '—'; }
  usedBy(t: NotificationTemplate) { return this.rules().filter((r) => r.templateId === t.id).length; }

  toggle(rule: NotificationRule) {
    if (!this.ui.requires('Manage Notifications')) { this.store.notificationRules.update((l) => [...l]); return; }
    this.store.toggleNotificationRule(rule.id);
  }

  async ruleForm(rule?: NotificationRule) {
    if (!this.ui.requires('Manage Notifications')) return;
    const tpl = this.ops.templates().filter((t) => t.purpose === 'Expiry alert').map((t) => ({ value: t.id, label: `${t.name} (${t.language})` }));
    const v = await this.ui.form({
      title: rule ? 'Edit notification rule' : 'New notification rule', subtitle: 'Alerts are sent before a contract reaches its end date', icon: 'notifications_active', submitLabel: rule ? 'Save rule' : 'Create rule',
      values: rule ? { ...rule, channel: rule.channel.split(' + '), recipients: rule.recipients } : { contractType: 'All Contracts', channel: ['Email', 'In-App'], recipients: ['Contract owner', 'Contract Management team'], templateId: 'T1', vendor: 'All vendors', department: 'All departments' },
      fields: [
        { key: 'contractType', label: 'Contract type', type: 'select', options: ['All Contracts', ...this.types()], required: true },
        { key: 'thresholdDays', label: 'Days before expiry', type: 'number', min: 1, required: true, placeholder: 'e.g. 30' },
        { key: 'channel', label: 'Notification channels', type: 'multiselect', options: CHANNELS, required: true },
        { key: 'recipients', label: 'Recipients', type: 'multiselect', options: RECIPIENTS, required: true },
        { key: 'templateId', label: 'Template (language follows the template)', type: 'select', options: tpl, required: true },
        { key: 'vendor', label: 'Vendor scope', type: 'select', options: ['All vendors', ...this.vendors()] },
        { key: 'department', label: 'Department scope', type: 'select', options: ['All departments', ...this.departments()] },
      ],
    });
    if (!v) return;
    const data = {
      contractType: v['contractType'], thresholdDays: Number(v['thresholdDays']), channel: join(v['channel'], ' + ', CHANNELS), recipients: join(v['recipients'], ', ', RECIPIENTS),
      templateId: v['templateId'], language: this.ops.templates().find((t) => t.id === v['templateId'])?.language ?? 'English', vendor: v['vendor'] || 'All vendors', department: v['department'] || 'All departments',
    };
    if (rule) this.store.updateNotificationRule(rule.id, data);
    else this.store.addNotificationRule(data);
    this.ui.toast(rule ? 'Notification rule updated.' : 'Notification rule created.');
  }

  private sampleFor(rule: NotificationRule): Promise<Contract | undefined> {
    const pool = this.ops.active().filter((c) => ruleApplies({ ...rule, active: true }, c) && c.daysRemaining >= 0);
    const list = [...(pool.length ? pool : this.ops.active())].sort((a, b) => Math.abs(a.daysRemaining - rule.thresholdDays) - Math.abs(b.daysRemaining - rule.thresholdDays));
    return this.ui.form({
      title: 'Send a test notification', subtitle: `${rule.contractType} · ${rule.thresholdDays} days · ${rule.channel}`, icon: 'science', submitLabel: 'Preview message',
      values: { contract: list[0]?.id },
      fields: [{ key: 'contract', label: 'Use this contract for the placeholders', type: 'select', options: list.map((c) => ({ value: c.id, label: `${c.reference} — ${c.name}` })), required: true }],
    }).then((v) => list.find((c) => c.id === v?.['contract']));
  }

  async sendTest(rule: NotificationRule) {
    if (!this.ui.requires('Manage Notifications')) return;
    const c = await this.sampleFor(rule);
    const t = this.templateOf(rule);
    if (!c) return;
    if (!t) { this.ui.toast('This rule has no template yet — edit it and pick one.'); return; }
    const ok = await this.ui.confirm({
      title: 'Send this test?', icon: 'science', confirmLabel: 'Send test',
      message: `To: ${rule.recipients}\nVia: ${rule.channel}\n\nSubject: ${renderTemplate(t.emailSubject, c)}\n\n${renderTemplate(t.emailBody, c)}\n\nSMS: ${renderTemplate(t.sms, c)}`,
    });
    if (!ok) return;
    this.store.notify(`Test alert: ${renderTemplate(t.inApp, { ...c })}`, `Test via ${rule.channel}`, 'info', '/contracts-budget/contracts/' + c.id);
    this.store.log('Notification Test Sent', c.reference, `Test "${t.name}" sent via ${rule.channel} to ${rule.recipients}.`);
    this.ui.toast(`Test notification sent via ${rule.channel}. Check the bell for the in-app version.`);
  }

  async remove(rule: NotificationRule) {
    if (!this.ui.requires('Manage Notifications')) return;
    const ok = await this.ui.confirm({ title: 'Delete this rule?', message: `${rule.contractType} · ${rule.thresholdDays} days before expiry will stop sending alerts.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    this.store.deleteNotificationRule(rule.id);
    this.ui.toast('Rule deleted.');
  }

  // ---------- templates ----------
  async templateForm(t?: NotificationTemplate) {
    if (!this.ui.requires('Manage Notifications')) return;
    const v = await this.ui.form({
      title: t ? 'Edit template' : 'New template', subtitle: 'Use placeholders such as {{contractReference}} and {{daysRemaining}}', icon: 'mail', submitLabel: 'Save template',
      values: t ? { ...t } : { purpose: 'Expiry alert', language: 'English' },
      fields: [
        { key: 'name', label: 'Template name', required: true },
        { key: 'purpose', label: 'Purpose', type: 'select', options: ['Expiry alert', 'Escalation'], required: true },
        { key: 'language', label: 'Language', type: 'select', options: ['English', 'Arabic'], required: true },
        { key: 'emailSubject', label: 'Email subject', required: true },
        { key: 'emailBody', label: 'Email body', type: 'textarea', rows: 6, required: true },
        { key: 'sms', label: 'SMS content', type: 'textarea', required: true },
        { key: 'inApp', label: 'In-application alert content', type: 'textarea', required: true, hint: 'Placeholders: ' + this.placeholders },
      ],
    });
    if (!v) return;
    this.ops.saveTemplate({ ...(t ? { id: t.id } : {}), name: v['name'], purpose: v['purpose'], language: v['language'], emailSubject: v['emailSubject'], emailBody: v['emailBody'], sms: v['sms'], inApp: v['inApp'] });
    this.ui.toast('Template saved.');
  }

  async removeTemplate(t: NotificationTemplate) {
    if (!this.ui.requires('Manage Notifications')) return;
    if (this.usedBy(t)) { this.ui.toast(`"${t.name}" is used by ${this.usedBy(t)} rule(s). Point them to another template first.`, 4500); return; }
    const ok = await this.ui.confirm({ title: 'Delete this template?', message: `${t.name} (${t.language}) will be removed.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    this.ops.deleteTemplate(t.id);
    this.ui.toast('Template deleted.');
  }

  async preview(t: NotificationTemplate) {
    const c = this.ops.active().find((x) => x.daysRemaining >= 0 && x.daysRemaining <= 30) ?? this.ops.active()[0];
    if (!c) return;
    await this.ui.confirm({
      title: `Preview — ${t.name}`, icon: 'visibility', confirmLabel: 'Close',
      message: `Sample contract: ${c.reference}\n\nSubject: ${renderTemplate(t.emailSubject, c)}\n\n${renderTemplate(t.emailBody, c)}\n\nSMS: ${renderTemplate(t.sms, c)}\n\nIn-app: ${renderTemplate(t.inApp, c)}`,
    });
  }

  // ---------- escalation ----------
  async escalationForm() {
    if (!this.ui.requires('Manage Escalations')) return;
    const r = this.ops.escalationRule();
    const v = await this.ui.form({
      title: 'Escalation rule', subtitle: 'When an unresolved contract is escalated, and to whom', icon: 'priority_high', submitLabel: 'Save rule',
      values: { hours: r.hours, appliesTo: r.appliesTo, recipients: r.recipients.split(/,\s*/).map((x) => x[0].toUpperCase() + x.slice(1)) },
      fields: [
        { key: 'hours', label: 'Hours before expiry', type: 'number', min: 1, max: 720, required: true, hint: 'The default is 48 hours.' },
        { key: 'appliesTo', label: 'Contract types it applies to', type: 'multiselect', options: this.types(), hint: 'Select none to apply the rule to every contract type.' },
        { key: 'recipients', label: 'Escalation recipients', type: 'multiselect', options: RECIPIENTS, required: true },
      ],
    });
    if (!v) return;
    this.ops.setEscalationRule({ hours: Number(v['hours']), appliesTo: v['appliesTo'] ?? [], recipients: join(v['recipients'], ', ', RECIPIENTS) });
    this.ui.toast('Escalation rule saved.');
  }
}
