import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { NAV_GROUPS, NavGroup } from '../../nav.config';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatIconModule],
  template: `
    <!-- Mobile backdrop -->
    @if (mobileOpen) {
      <div class="fixed inset-0 bg-ink-900/40 z-30 lg:hidden" (click)="closeMobile.emit()"></div>
    }

    <aside
      class="bg-sidebar-gradient flex flex-col shrink-0 transition-all duration-200 fixed lg:static inset-y-0 left-0 z-40 h-full lg:!translate-x-0"
      [class.w-64]="!collapsed()"
      [class.w-16]="collapsed()"
      [class.-translate-x-full]="!mobileOpen"
      [class.translate-x-0]="mobileOpen"
    >
      <div
        class="flex items-center shrink-0 border-b border-white/10 gap-2"
        [class.justify-between]="!collapsed()"
        [class.px-4]="!collapsed()"
        [class.h-16]="!collapsed()"
        [class.justify-center]="collapsed()"
        [class.py-4]="collapsed()"
      >
        @if (!collapsed()) {
          <div class="w-9 h-9 rounded-xl bg-brand-gradient text-white flex items-center justify-center font-extrabold text-sm shrink-0">C</div>
          <div class="leading-tight flex-1 min-w-0">
            <div class="text-sm font-bold text-white truncate">CRC Portal</div>
            <div class="text-[11px] text-white/45 truncate">Omantel &middot; Tawasul</div>
          </div>
        }
        <button
          class="w-7 h-7 rounded-lg items-center justify-center text-white/50 hover:text-white hover:bg-white/10 shrink-0 hidden lg:flex"
          (click)="collapsed.set(!collapsed())"
          [title]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
        >
          <mat-icon class="!text-lg">{{ collapsed() ? 'chevron_right' : 'chevron_left' }}</mat-icon>
        </button>
        <button class="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 lg:hidden shrink-0" (click)="closeMobile.emit()">
          <mat-icon class="!text-lg">close</mat-icon>
        </button>
      </div>

      @if (!collapsed()) {
        <div class="px-3 pt-3 pb-2 shrink-0">
          <div class="relative">
            <mat-icon class="!text-base !text-white/35 absolute left-2.5 top-1/2 -translate-y-1/2">search</mat-icon>
            <input
              [(ngModel)]="query"
              placeholder="Search menu..."
              class="w-full pl-8 pr-7 py-1.5 text-[12.5px] rounded-lg bg-white/[0.06] text-white placeholder:text-white/35 focus:outline-none focus:bg-white/[0.1] transition-colors"
            />
            @if (query) {
              <button class="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10" (click)="query = ''">
                <mat-icon class="!text-sm">close</mat-icon>
              </button>
            }
          </div>
        </div>
      }

      <nav class="flex-1 overflow-y-auto py-3 px-2">
        @for (group of filteredGroups; track group.label) {
          <div class="mb-4">
            @if (!collapsed()) {
              <div class="px-2.5 pt-1 pb-2 text-[10.5px] font-bold uppercase tracking-wider text-white/35">
                {{ group.label }}
              </div>
            }
            @for (item of group.items; track item.path) {
              <a
                [routerLink]="group.basePath + '/' + item.path"
                routerLinkActive="!bg-white/[0.08] !text-white before:!opacity-100"
                #rla="routerLinkActive"
                (click)="closeMobile.emit()"
                class="relative flex items-center gap-3 px-2.5 py-2 mb-0.5 rounded-xl text-[13.5px] font-medium text-white/60 hover:bg-white/5 hover:text-white/90 transition-colors before:content-[''] before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-4 before:w-[3px] before:rounded-full before:bg-accent-500 before:opacity-0 before:transition-opacity"
                [title]="item.label"
              >
                <mat-icon
                  class="!text-[19px] !w-5 !h-5 shrink-0"
                  [class.!text-accent-400]="rla.isActive"
                >{{ item.icon }}</mat-icon>
                @if (!collapsed()) {
                  <span class="truncate">{{ item.label }}</span>
                }
              </a>
            }
          </div>
        }
        @if (query && filteredGroups.length === 0) {
          <div class="px-3 py-6 text-center text-xs text-white/35">No menu items match "{{ query }}"</div>
        }
      </nav>
    </aside>
  `,
})
export class SidebarComponent {
  @Input() mobileOpen = false;
  @Output() closeMobile = new EventEmitter<void>();

  groups = NAV_GROUPS;
  collapsed = signal(false);
  query = '';

  get filteredGroups(): NavGroup[] {
    const q = this.query.trim().toLowerCase();
    if (!q) return this.groups;
    return this.groups
      .map((group): NavGroup => ({
        ...group,
        items: group.items.filter(
          (item) => item.label.toLowerCase().includes(q) || group.label.toLowerCase().includes(q)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }
}
