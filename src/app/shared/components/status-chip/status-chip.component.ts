import { Component, Input } from '@angular/core';
import { StatusLevel } from '../../../core/models/status';

@Component({
  selector: 'app-status-chip',
  standalone: true,
  template: `<span class="status-chip" [class]="'status-chip--' + level">{{ label }}</span>`,
})
export class StatusChipComponent {
  @Input() label = '';
  @Input() level: StatusLevel = 'neutral';
}
