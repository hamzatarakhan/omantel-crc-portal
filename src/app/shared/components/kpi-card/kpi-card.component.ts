import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StatusLevel } from '../../../core/models/status';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="surface-card px-4 pt-2.5 pb-3 h-full flex flex-col gap-0.5 min-w-0 overflow-hidden hover:border-brand-200">
      <div class="flex items-start justify-between gap-2">
        <span class="text-[11px] font-bold text-ink-400 uppercase tracking-wider leading-tight flex items-center">{{ label }}</span>
        @if (icon) {
          <span class="w-6 h-6 rounded-md flex items-center justify-center shrink-0" [style.background]="badgeBg" [style.color]="accentColor">
            <span class="material-icons !text-[15px]">{{ icon }}</span>
          </span>
        }
      </div>
      <div class="flex items-baseline flex-wrap gap-x-1.5 gap-y-0 mt-auto min-w-0">
        <span class="text-lg sm:text-xl leading-tight font-extrabold text-ink-900 truncate max-w-full" [style.color]="level !== 'neutral' ? accentColor : null">{{ value }}</span>
        @if (unit) {
          <span class="text-xs font-medium text-ink-400 whitespace-nowrap">{{ unit }}</span>
        }
      </div>
      @if (trend) {
        <span class="inline-flex items-center gap-1 text-xs font-semibold w-fit" [class]="trendPositive ? 'text-emerald-600' : 'text-red-500'">
          <span class="material-icons !text-sm">{{ trendPositive ? 'trending_up' : 'trending_down' }}</span>
          {{ trend }}
        </span>
      }
    </div>
  `,
  styles: [':host { display: contents; }'],
})
export class KpiCardComponent {
  @Input() label = '';
  @Input() value: string | number | null = '';
  @Input() unit = '';
  @Input() icon = '';
  @Input() trend = '';
  @Input() trendPositive = true;
  @Input() level: StatusLevel = 'neutral';

  get accentColor(): string {
    const map: Record<StatusLevel, string> = {
      normal: '#057a55',
      amber: '#a35b00',
      orange: '#ea6e00',
      red: '#c81e1e',
      info: '#2d13ea',
      neutral: '#2d13ea',
    };
    return map[this.level];
  }

  get badgeBg(): string {
    const map: Record<StatusLevel, string> = {
      normal: '#edfcf5',
      amber: '#fef8e7',
      orange: '#fff4e9',
      red: '#fdf1f1',
      info: '#f2f0fe',
      neutral: '#f2f0fe',
    };
    return map[this.level];
  }
}
