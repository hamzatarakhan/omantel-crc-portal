import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

export interface Breadcrumb {
  label: string;
  link?: string;
}

@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="flex flex-col gap-1.5 mb-6">
      @if (breadcrumbs.length) {
        <nav class="text-xs font-medium text-ink-400 flex items-center gap-1.5">
          @for (crumb of breadcrumbs; track crumb.label; let last = $last) {
            @if (crumb.link && !last) {
              <a [routerLink]="crumb.link" class="hover:text-brand-600 transition-colors">{{ crumb.label }}</a>
            } @else {
              <span [class.text-brand-600]="last" [class.font-semibold]="last">{{ crumb.label }}</span>
            }
            @if (!last) {
              <span class="text-ink-400/50">/</span>
            }
          }
        </nav>
      }
      <div class="flex items-start sm:items-center justify-between flex-wrap gap-3">
        <div class="min-w-0">
          <h1 class="text-xl sm:text-[26px] leading-tight font-extrabold text-ink-900 truncate">{{ title }}</h1>
          @if (subtitle) {
            <p class="text-xs sm:text-sm text-ink-500 mt-1">{{ subtitle }}</p>
          }
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <ng-content></ng-content>
        </div>
      </div>
    </div>
  `,
})
export class PageHeaderComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() breadcrumbs: Breadcrumb[] = [];
}
