import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { RequiresDirective } from '../../../shared/directives/requires.directive';
import { ContractOps } from '../../../core/services/contract-ops.service';
import { UiService } from '../../../shared/services/ui.service';
import { SYNC_FREQUENCIES, SyncFrequency } from '../../../core/services/contract-monitoring';

const INPUT = 'w-full px-3 py-2.5 text-sm rounded-lg border border-surface-border bg-white focus:outline-none focus:border-brand-400';

@Component({
  selector: 'app-sync-config',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatSlideToggleModule, PageHeaderComponent, RequiresDirective],
  template: `
    <app-page-header
      title="Synchronization Configuration"
      subtitle="How often CRC pulls vendors, contracts, subcontracts and purchase orders from the ERP"
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Synchronization' }, { label: 'Configuration' }]"
    >
      <button mat-stroked-button (click)="runNow()" appRequires="Manage Sync Configuration" [disabled]="running()"><mat-icon class="!text-base !mr-1" [class.animate-spin]="running()">play_arrow</mat-icon>{{ running() ? 'Running…' : 'Run scheduled sync now (demo)' }}</button>
    </app-page-header>

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
      <div class="surface-card px-5 py-4 xl:col-span-2">
        <h3 class="text-[13.5px] font-bold text-ink-900">Automated synchronization</h3>
        <div class="flex items-center gap-3 mt-3 pb-4 border-b border-surface-border">
          <mat-slide-toggle [checked]="enabled()" (change)="enabled.set(!enabled())"></mat-slide-toggle>
          <div><div class="text-sm font-medium text-ink-900">{{ enabled() ? 'Automated synchronization is on' : 'Automated synchronization is off' }}</div><div class="text-xs text-ink-400">When it is off, CRC keeps showing the last synchronized data until someone turns it back on.</div></div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <label class="block"><span class="text-[13px] font-medium text-ink-700 block mb-1.5">Synchronization period</span>
            <select [class]="input" [ngModel]="frequency()" (ngModelChange)="frequency.set($event)">@for (f of frequencies; track f) { <option [value]="f">{{ f }}</option> }</select>
            <span class="text-[11px] text-ink-400 mt-1 block">Final options depend on what the ERP integration supports (confirmed in technical design).</span></label>
          <label class="block"><span class="text-[13px] font-medium text-ink-700 block mb-1.5">Start time ({{ ops.syncConfig().timezone }})</span>
            <input type="time" [class]="input" [ngModel]="time()" (ngModelChange)="time.set($event)" />
            <span class="text-[11px] text-ink-400 mt-1 block">Weekly runs start on Sunday. Twice-daily and 6-hourly runs repeat from this time.</span></label>
          <label class="block"><span class="text-[13px] font-medium text-ink-700 block mb-1.5">Manual synchronization timeout (seconds)</span>
            <input type="number" min="10" max="600" [class]="input" [ngModel]="timeout()" (ngModelChange)="timeout.set($event)" />
            <span class="text-[11px] text-ink-400 mt-1 block">After this long without an ERP response, a manual sync fails with a timeout and can be retried.</span></label>
          <label class="block"><span class="text-[13px] font-medium text-ink-700 block mb-1.5">Organisation time zone</span>
            <input [class]="input + ' bg-surface-subtle'" [value]="ops.syncConfig().timezone" disabled />
            <span class="text-[11px] text-ink-400 mt-1 block">Alerts and schedules are generated in this time zone.</span></label>
        </div>
        <div class="flex justify-end gap-2 mt-5 pt-4 border-t border-surface-border">
          <button mat-button (click)="reset()" [disabled]="!dirty()">Discard changes</button>
          <button mat-flat-button color="primary" (click)="save()" appRequires="Manage Sync Configuration" [disabled]="!dirty()">Save configuration</button>
        </div>
      </div>

      <div class="flex flex-col gap-4">
        <div class="surface-card px-5 py-4">
          <h3 class="text-[13.5px] font-bold text-ink-900">Schedule</h3>
          <dl class="grid gap-y-3 mt-3 text-sm">
            <div><dt class="text-xs text-ink-400">Currently configured</dt><dd class="font-medium text-ink-900">{{ ops.syncConfig().enabled ? ops.syncConfig().frequency + ' at ' + ops.syncConfig().time : 'Off' }}</dd></div>
            <div><dt class="text-xs text-ink-400">Next scheduled run</dt><dd class="font-medium text-ink-900">{{ nextRun() }}</dd></div>
          </dl>
        </div>
        <div class="surface-card px-5 py-4">
          <h3 class="text-[13.5px] font-bold text-ink-900">Rules that always apply</h3>
          <ul class="mt-2 text-xs text-ink-500 leading-relaxed list-disc pl-4 space-y-1.5">
            <li>The ERP is the system of record; ERP data always wins over anything in CRC.</li>
            <li>Records are matched on the ERP reference, so repeated runs never create duplicates.</li>
            <li>A failed run keeps the last valid data and never marks contracts as expired or missing.</li>
            <li>A manual sync of one contract never changes this schedule.</li>
            <li>Every change is written to the audit trail with its previous and new value.</li>
          </ul>
        </div>
      </div>
    </div>
  `,
})
export class SyncConfigComponent {
  ops = inject(ContractOps);
  private ui = inject(UiService);
  input = INPUT;
  frequencies = SYNC_FREQUENCIES;
  running = signal(false);

  enabled = signal(this.ops.syncConfig().enabled);
  frequency = signal<SyncFrequency>(this.ops.syncConfig().frequency);
  time = signal(this.ops.syncConfig().time);
  timeout = signal<number>(this.ops.syncConfig().timeoutSec);

  dirty = computed(() => { const c = this.ops.syncConfig(); return c.enabled !== this.enabled() || c.frequency !== this.frequency() || c.time !== this.time() || c.timeoutSec !== Number(this.timeout()); });
  nextRun = computed(() => { const d = this.ops.nextRun(); return d ? d.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Muscat' }) + ' (Muscat)' : 'Not scheduled'; });

  reset() {
    const c = this.ops.syncConfig();
    this.enabled.set(c.enabled); this.frequency.set(c.frequency); this.time.set(c.time); this.timeout.set(c.timeoutSec);
  }

  save() {
    if (!this.ui.requires('Manage Sync Configuration')) return;
    const t = Number(this.timeout());
    if (!this.time() || !(t >= 10 && t <= 600)) { this.ui.toast('Enter a start time and a timeout between 10 and 600 seconds.'); return; }
    this.ops.setSyncConfig({ ...this.ops.syncConfig(), enabled: this.enabled(), frequency: this.frequency(), time: this.time(), timeoutSec: t });
    this.ui.toast('Synchronization configuration saved.');
  }

  runNow() {
    if (!this.ui.requires('Manage Sync Configuration')) return;
    this.running.set(true);
    setTimeout(() => {
      const run = this.ops.runScheduledSync();
      this.running.set(false);
      this.ui.toast(run.updated ? `Scheduled sync complete — ${run.updated} contract${run.updated > 1 ? 's' : ''} updated.` : 'Scheduled sync complete — no changes found.');
    }, 900);
  }
}
