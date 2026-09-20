import { Directive, computed, inject, input } from '@angular/core';
import { CrcStore } from '../../core/services/crc-store.service';

/**
 * Marks an action as unavailable for the current role: dimmed, not-allowed cursor and a tooltip that says
 * why. The click handler still runs `UiService.requires(...)`, which explains it in a toast if clicked.
 */
@Directive({
  selector: '[appRequires]',
  standalone: true,
  host: {
    '[class.opacity-50]': 'blocked()',
    '[class.!cursor-not-allowed]': 'blocked()',
    '[attr.aria-disabled]': 'blocked() ? "true" : null',
    '[attr.title]': 'blocked() ? tip() : null',
  },
})
export class RequiresDirective {
  private store = inject(CrcStore);
  permission = input.required<string>({ alias: 'appRequires' });

  blocked = computed(() => !this.store.can(this.permission()));
  tip = computed(() => `Not available for ${this.store.currentRole()} — requires the "${this.permission()}" permission`);
}
