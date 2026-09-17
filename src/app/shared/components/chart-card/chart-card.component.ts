import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartType } from 'chart.js';

@Component({
  selector: 'app-chart-card',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  template: `
    <div class="surface-card p-4 sm:p-5 flex flex-col gap-3 h-full hover:border-brand-200">
      <div>
        <h3 class="text-[13.5px] font-bold text-ink-900">{{ title }}</h3>
        @if (subtitle) {
          <p class="text-xs text-ink-400 mt-0.5">{{ subtitle }}</p>
        }
      </div>
      <div class="flex-1 min-h-[220px]">
        <canvas
          baseChart
          [data]="data"
          [type]="type"
          [options]="options"
        ></canvas>
      </div>
    </div>
  `,
  styles: [':host { display: contents; }'],
})
export class ChartCardComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() type: ChartType = 'bar';
  @Input() data!: ChartConfiguration['data'];
  @Input() options: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
  };
}
