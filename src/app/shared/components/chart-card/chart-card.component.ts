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
  // A `contents` host would let the inner div become the grid item directly, but then
  // grid-column classes (e.g. lg:col-span-2) applied to the <app-chart-card> tag itself
  // have nothing to attach to and are silently dropped — leaving unused track(s) empty.
  // `block` keeps the host itself as the grid item, so span classes on the tag work.
  styles: [':host { display: block; height: 100%; }'],
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
