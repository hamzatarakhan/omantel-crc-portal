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
      class="bg-white border-r border-surface-border flex flex-col shrink-0 transition-all duration-200 fixed lg:static inset-y-0 left-0 z-40 h-full lg:!translate-x-0"
      [class.w-64]="!collapsed()"
      [class.w-16]="collapsed()"
      [class.-translate-x-full]="!mobileOpen"
      [class.translate-x-0]="mobileOpen"
    >
      <div
        class="flex items-center shrink-0 border-b border-surface-border gap-2"
        [class.justify-between]="!collapsed()"
        [class.px-4]="!collapsed()"
        [class.h-16]="!collapsed()"
        [class.justify-center]="collapsed()"
        [class.py-4]="collapsed()"
      >
        @if (!collapsed()) {
          <div class="flex-1 min-w-0 flex flex-col gap-1">
            <img src="logo.svg" alt="Omantel" class="h-[21px] w-auto self-start" />
            <div class="text-[10.5px] font-bold uppercase tracking-wider text-ink-400 truncate">CRC Portal &middot; Tawasul</div>
          </div>
        }
        <button
          class="w-7 h-7 rounded-lg items-center justify-center text-ink-400 hover:text-brand-600 hover:bg-brand-50 shrink-0 hidden lg:flex"
          (click)="collapsed.set(!collapsed())"
          [title]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
        >
          <mat-icon class="!text-lg">{{ collapsed() ? 'chevron_right' : 'chevron_left' }}</mat-icon>
        </button>
        <button class="w-8 h-8 rounded-lg flex items-center justify-center text-ink-500 hover:text-brand-600 hover:bg-brand-50 lg:hidden shrink-0" (click)="closeMobile.emit()">
          <mat-icon class="!text-lg">close</mat-icon>
        </button>
      </div>

      @if (!collapsed()) {
        <div class="px-3 pt-3 pb-2 shrink-0">
          <div class="relative">
            <mat-icon class="!text-base !text-ink-400 absolute left-2.5 top-1/2 -translate-y-1/2">search</mat-icon>
            <input
              [(ngModel)]="query"
              placeholder="Search menu..."
              class="w-full pl-8 pr-7 py-1.5 text-[12.5px] rounded-lg bg-surface-subtle border border-surface-border text-ink-900 placeholder:text-ink-400 focus:outline-none focus:bg-white focus:border-brand-400 transition-colors"
            />
            @if (query) {
              <button class="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md flex items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-white" (click)="query = ''">
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
              <div class="px-2.5 pt-1 pb-2 text-[10.5px] font-bold uppercase tracking-wider text-ink-400">
                {{ group.label }}
              </div>
            }
            @for (item of group.items; track item.path) {
              <a
                [routerLink]="group.basePath + '/' + item.path"
                routerLinkActive="!bg-brand-50 !text-brand-600 !font-semibold before:!opacity-100"
                #rla="routerLinkActive"
                (click)="closeMobile.emit()"
                class="relative flex items-center gap-3 px-2.5 py-2 mb-0.5 rounded-xl text-[13.5px] font-medium text-ink-500 hover:bg-surface-subtle hover:text-ink-900 transition-colors before:content-[''] before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-4 before:w-[3px] before:rounded-full before:bg-brand-500 before:opacity-0 before:transition-opacity"
                [title]="item.label"
              >
                <mat-icon
                  class="!text-[19px] !w-5 !h-5 shrink-0"
                  [class.!text-brand-600]="rla.isActive"
                >{{ item.icon }}</mat-icon>
                @if (!collapsed()) {
                  <span class="truncate">{{ item.label }}</span>
                }
              </a>
            }
          </div>
        }
        @if (query && filteredGroups.length === 0) {
          <div class="px-3 py-6 text-center text-xs text-ink-400">No menu items match "{{ query }}"</div>
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
