import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="flex flex-col items-center justify-center gap-2.5 py-16 text-center">
      <div class="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center">
        <mat-icon class="!text-2xl !text-brand-300">{{ icon }}</mat-icon>
      </div>
      <p class="text-sm font-bold text-ink-700">{{ title }}</p>
      <p class="text-xs text-ink-400 max-w-xs">{{ description }}</p>
    </div>
  `,
})
export class EmptyStateComponent {
  @Input() icon = 'inbox';
  @Input() title = 'Nothing here yet';
  @Input() description = '';
}
