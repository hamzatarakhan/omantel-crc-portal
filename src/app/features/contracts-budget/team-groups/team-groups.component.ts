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
 * rows of the Team Forecast (Revenue, Complaints, ...). Drag a team onto a group to link it; drag it back to the top bar to unlink.
 * Laid out as a board (unassigned teams pinned on top, groups in a grid) so every group is visible at once.
 */
@Component({
  selector: 'app-team-groups',
  standalone: true,
  imports: [CommonModule, RouterModule, CdkDropListGroup, CdkDropList, CdkDrag, MatButtonModule, MatIconModule, PageHeaderComponent],
  template: `
    <app-page-header
      title="Group of Teams"
      subtitle="Drag each team (workforce queue) onto the group of teams it belongs to."
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'CSR Forecast' }, { label: 'Group of Teams' }]"
    ></app-page-header>

    <div cdkDropListGroup>
      <!-- unassigned teams, always in view while you drag -->
      <section class="surface-card px-4 py-3 mb-4 sticky top-0 z-20">
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div class="min-w-0">
            <h3 class="text-[13.5px] font-bold text-ink-900 flex items-center gap-2"><mat-icon class="!text-lg text-ink-400">groups_2</mat-icon>No group yet <span class="text-xs font-semibold text-ink-400">{{ free().length }} of {{ svc.allTeams().length }} teams</span></h3>
          </div>
          <div class="flex items-center gap-2">
            <input class="w-52 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-surface-border bg-white text-ink-700 focus:outline-none focus:border-brand-400" placeholder="New group, e.g. Corporate accounts" [value]="newName()" (input)="newName.set($any($event.target).value)" (keydown.enter)="create()" />
            <button mat-flat-button color="primary" class="!h-8 !text-xs" (click)="create()"><mat-icon class="!text-base !mr-0.5">add</mat-icon>Create group</button>
          </div>
        </div>
        <div cdkDropList cdkDropListOrientation="mixed" [cdkDropListSortingDisabled]="true" [cdkDropListData]="''" (cdkDropListDropped)="drop($event)" class="zone mt-2.5 max-h-28 overflow-y-auto">
          @for (t of free(); track t) { <div cdkDrag [cdkDragData]="t" class="chip"><mat-icon class="!text-[15px] !w-[15px] !h-[15px] text-ink-300">drag_indicator</mat-icon>{{ t }}<span class="cnt">{{ svc.agentsIn(t) }}</span></div> }
          @empty { <span class="text-xs text-status-green font-medium inline-flex items-center gap-1"><mat-icon class="!text-base">check_circle</mat-icon>Every team is linked to a group.</span> }
        </div>
      </section>

      <!-- the groups -->
      <div class="board">
        @for (g of svc.teams(); track g.name) {
          <section class="surface-card px-3 pt-2.5 pb-3">
            <div class="flex items-center gap-2 min-h-[28px]">
              <h3 class="flex-1 min-w-0 text-[13px] font-bold text-ink-900 truncate" [title]="g.name">{{ g.name }}</h3>
              <span class="text-[11px] font-semibold text-ink-400 whitespace-nowrap">{{ svc.teamsOf(g.name).length }} · {{ agentTotal(g.name) }} agents</span>
              @if (svc.canRemoveGroup(g.name)) { <button class="w-6 h-6 rounded-md flex items-center justify-center text-ink-400 hover:bg-surface-subtle hover:text-status-red" title="Delete this empty group" (click)="remove(g.name)"><mat-icon class="!text-base">delete_outline</mat-icon></button> }
            </div>
            <div cdkDropList cdkDropListOrientation="mixed" [cdkDropListSortingDisabled]="true" [cdkDropListData]="g.name" (cdkDropListDropped)="drop($event)" class="zone mt-2">
              @for (t of svc.teamsOf(g.name); track t) { <div cdkDrag [cdkDragData]="t" class="chip in"><mat-icon class="!text-[15px] !w-[15px] !h-[15px] text-brand-300">drag_indicator</mat-icon>{{ t }}<span class="cnt">{{ svc.agentsIn(t) }}</span></div> }
              @empty { <span class="text-[11px] text-ink-400 px-1">Drop teams here</span> }
            </div>
          </section>
        }
      </div>
    </div>
    <p class="text-xs text-ink-400 mt-3">The number on a team is how many agents work in that queue. A team belongs to one group; dropping it on another group moves it. A new group's approved budget is set in <a class="text-brand-600 font-medium" routerLink="/contracts-budget/forecast-settings">Forecast Settings</a>.</p>
  `,
  styles: [`
    .board { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); align-items: start; }
    .zone { display: flex; flex-wrap: wrap; align-content: flex-start; gap: 6px; min-height: 46px; padding: 6px; border: 1.5px dashed #e3e2ec; border-radius: 10px; background: #fafafc; transition: border-color .15s, background .15s; }
    .zone.cdk-drop-list-dragging, .zone.cdk-drop-list-receiving { border-color: #fb923c; background: #fff7ed; }
    .chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px 4px 4px; border-radius: 8px; border: 1px solid #e3e2ec; background: #fff; font-size: 12px; font-weight: 600; color: #413e5c; cursor: grab; user-select: none; white-space: nowrap; }
    .chip.in { background: #fff4e9; border-color: #fdd6b0; color: #b45309; }
    .chip .cnt { font-size: 10.5px; font-weight: 700; color: #9ca3af; background: #f3f4f6; border-radius: 999px; padding: 0 6px; margin-left: 2px; }
    .chip.in .cnt { background: #ffe8d1; color: #c2410c; }
    .cdk-drag-preview { box-shadow: 0 10px 24px -8px rgba(25,23,51,.35); border-radius: 8px; }
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
