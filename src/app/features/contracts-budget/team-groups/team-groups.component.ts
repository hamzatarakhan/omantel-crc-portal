import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CrcStore } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { ForecastService } from '../../../core/services/forecast.service';

/**
 * Which group of teams each team belongs to. The teams are the workforce queues (RTM, Project, Hotline, ...); the groups are the
 * rows of the Team Forecast (Revenue, Complaints, ...). Drag a team onto a group to link it; drag it back to "No group" to unlink.
 */
@Component({
  selector: 'app-team-groups',
  standalone: true,
  imports: [CommonModule, RouterModule, CdkDropListGroup, CdkDropList, CdkDrag, MatButtonModule, MatIconModule, PageHeaderComponent],
  template: `
    <app-page-header
      title="Group of Teams"
      subtitle="Link the teams (the workforce queues) to the groups the Team Forecast is prepared for. Drag a team onto a group."
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'CSR Forecast' }, { label: 'Group of Teams' }]"
    ></app-page-header>

    <div class="surface-card px-4 py-3.5 mb-4 flex flex-wrap items-end gap-3">
      <label class="block w-72"><span class="lbl">New group</span>
        <input class="w-full mt-1 px-2.5 py-2 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 focus:outline-none focus:border-brand-400" placeholder="e.g. Corporate accounts" [value]="newName()" (input)="newName.set($any($event.target).value)" (keydown.enter)="create()" /></label>
      <button mat-flat-button color="primary" (click)="create()"><mat-icon class="!text-base !mr-1">add</mat-icon>Create group</button>
      <span class="text-xs text-ink-400 pb-2">{{ linked() }} of {{ svc.allTeams().length }} teams are linked to a group. A new group's approved budget is set in <a class="text-brand-600 font-medium" routerLink="/contracts-budget/forecast-settings">Forecast Settings</a>.</span>
    </div>

    <div cdkDropListGroup class="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 items-start">
      <!-- teams with no group -->
      <section class="surface-card p-4 lg:sticky lg:top-2">
        <h3 class="text-[13.5px] font-bold text-ink-900 flex items-center gap-2"><mat-icon class="!text-lg text-ink-400">groups_2</mat-icon>No group yet <span class="text-xs font-semibold text-ink-400">{{ free().length }}</span></h3>
        <p class="text-xs text-ink-400 mt-0.5 mb-3">Teams that are not linked to any group.</p>
        <div cdkDropList [cdkDropListData]="''" (cdkDropListDropped)="drop($event)" class="zone min-h-[64px]">
          @for (t of free(); track t) { <div cdkDrag [cdkDragData]="t" class="chip"><mat-icon class="!text-base text-ink-300">drag_indicator</mat-icon><span class="flex-1">{{ t }}</span><span class="cnt">{{ svc.agentsIn(t) }}</span></div> }
          @empty { <div class="text-xs text-ink-400 text-center py-3">Every team is linked.</div> }
        </div>
      </section>

      <!-- groups -->
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        @for (g of svc.teams(); track g.name) {
          <section class="surface-card p-4">
            <div class="flex items-start gap-2">
              <div class="flex-1 min-w-0">
                <h3 class="text-[13.5px] font-bold text-ink-900 truncate">{{ g.name }}</h3>
                <p class="text-xs text-ink-400 mt-0.5">{{ svc.teamsOf(g.name).length }} team{{ svc.teamsOf(g.name).length === 1 ? '' : 's' }} · {{ agentTotal(g.name) }} agents</p>
              </div>
              @if (svc.canRemoveGroup(g.name)) { <button class="w-7 h-7 rounded-lg flex items-center justify-center text-ink-400 hover:bg-surface-subtle hover:text-status-red" title="Delete this empty group" (click)="remove(g.name)"><mat-icon class="!text-lg">delete_outline</mat-icon></button> }
            </div>
            <div cdkDropList [cdkDropListData]="g.name" (cdkDropListDropped)="drop($event)" class="zone min-h-[72px] mt-3">
              @for (t of svc.teamsOf(g.name); track t) { <div cdkDrag [cdkDragData]="t" class="chip in"><mat-icon class="!text-base text-brand-300">drag_indicator</mat-icon><span class="flex-1">{{ t }}</span><span class="cnt">{{ svc.agentsIn(t) }}</span></div> }
              @empty { <div class="text-xs text-ink-400 text-center py-4">Drop teams here</div> }
            </div>
          </section>
        }
      </div>
    </div>
    <p class="text-xs text-ink-400 mt-3">The number on each team is how many agents work in that queue. A team can belong to one group; moving it to another group replaces the link.</p>
  `,
  styles: [`
    .lbl { font-size: 10.5px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: .04em; }
    .zone { display: flex; flex-direction: column; gap: 6px; padding: 8px; border: 1.5px dashed #e3e2ec; border-radius: 12px; background: #fafafc; transition: border-color .15s, background .15s; }
    .zone.cdk-drop-list-dragging, .zone.cdk-drop-list-receiving { border-color: #fb923c; background: #fff7ed; }
    .chip { display: flex; align-items: center; gap: 6px; padding: 6px 10px 6px 6px; border-radius: 9px; border: 1px solid #e3e2ec; background: #fff; font-size: 12.5px; font-weight: 600; color: #413e5c; cursor: grab; user-select: none; }
    .chip.in { background: #fff4e9; border-color: #fdd6b0; color: #b45309; }
    .chip .cnt { font-size: 11px; font-weight: 700; color: #9ca3af; background: #f3f4f6; border-radius: 999px; padding: 0 7px; }
    .chip.in .cnt { background: #ffe8d1; color: #c2410c; }
    .cdk-drag-preview { box-shadow: 0 10px 24px -8px rgba(25,23,51,.35); border-radius: 9px; }
    .cdk-drag-placeholder { opacity: .25; }
    .cdk-drag-animating { transition: transform 200ms cubic-bezier(0, 0, 0.2, 1); }
  `],
})
export class TeamGroupsComponent {
  store = inject(CrcStore);
  svc = inject(ForecastService);
  private ui = inject(UiService);

  newName = signal('');

  free = () => this.svc.allTeams().filter((t) => !this.svc.teamGroup()[t]);
  linked = () => this.svc.allTeams().length - this.free().length;
  agentTotal = (group: string) => this.svc.teamsOf(group).reduce((s, t) => s + this.svc.agentsIn(t), 0);

  drop(e: CdkDragDrop<string>) {
    if (!this.ui.requires('Configure Forecast')) return;
    const team: string = e.item.data, target = e.container.data;
    this.svc.setTeamGroup(team, target || null);
  }

  create() {
    if (!this.ui.requires('Configure Forecast')) return;
    const err = this.svc.addGroup(this.newName());
    this.ui.toast(err ?? `Group "${this.newName().trim()}" created.`, err ? 4500 : 3000);
    if (!err) this.newName.set('');
  }

  remove(name: string) {
    if (!this.ui.requires('Configure Forecast')) return;
    const err = this.svc.removeGroup(name);
    this.ui.toast(err ?? `Group "${name}" deleted.`, err ? 4500 : 3000);
  }
}
