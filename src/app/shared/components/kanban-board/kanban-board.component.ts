import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { StatusChipComponent } from '../status-chip/status-chip.component';
import { StatusLevel } from '../../../core/models/status';

export interface KanbanCard {
  id: string;
  title: string;
  subtitle?: string;
  amountLabel?: string;
  column: string;
  badge?: { label: string; level: StatusLevel };
}

@Component({
  selector: 'app-kanban-board',
  standalone: true,
  imports: [CommonModule, MatIconModule, StatusChipComponent],
  template: `
    <div class="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
    <div class="grid gap-4" [style.gridTemplateColumns]="'repeat(' + columns.length + ', minmax(240px, 1fr))'" [style.minWidth.px]="columns.length * 240">
      @for (col of columns; track col; let i = $index) {
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center gap-2 px-1">
            <span class="w-2 h-2 rounded-full" [style.background]="colDotColor(i)"></span>
            <span class="text-xs font-bold uppercase tracking-wide text-ink-700">{{ col }}</span>
            <span class="text-[11px] font-semibold text-ink-400 bg-white border border-surface-border rounded-full px-1.5 py-0.5 ml-auto">{{ cardsByColumn()[col].length || 0 }}</span>
          </div>
          <div
            class="flex flex-col gap-2.5 bg-surface-subtle rounded-card border p-2.5 min-h-[140px] transition-colors"
            [class.border-surface-border]="hover() !== col"
            [class.!border-brand-400]="hover() === col"
            (dragover)="$event.preventDefault(); hover.set(col)"
            (dragleave)="hover.set('')"
            (drop)="drop($event, col)"
          >
            @for (card of cardsByColumn()[col]; track card.id) {
              <div
                class="surface-card p-3.5 flex flex-col gap-1.5 hover:border-brand-200 !border-t-[3px] cursor-grab active:cursor-grabbing"
                [style.borderTopColor]="colDotColor(i)"
                draggable="true"
                (dragstart)="$event.dataTransfer?.setData('text/plain', card.id)"
              >
                <span class="text-sm font-bold text-ink-900">{{ card.title }}</span>
                @if (card.subtitle) {
                  <span class="text-xs text-ink-400">{{ card.subtitle }}</span>
                }
                <div class="flex items-center justify-between mt-1.5">
                  @if (card.amountLabel) {
                    <span class="text-xs font-extrabold text-ink-900">{{ card.amountLabel }}</span>
                  }
                  @if (card.badge) {
                    <app-status-chip [label]="card.badge.label" [level]="card.badge.level"></app-status-chip>
                  }
                </div>
                @if (columns[i + 1]; as next) {
                  <button (click)="move.emit({ id: card.id, column: next })" class="mt-1.5 flex items-center justify-center gap-1 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg py-1.5 transition-colors">
                    Move to {{ next }}<mat-icon class="!text-sm">arrow_forward</mat-icon>
                  </button>
                }
              </div>
            } @empty {
              <div class="text-xs text-ink-400 text-center py-6">Nothing here. Drag a card in.</div>
            }
          </div>
        </div>
      }
    </div>
    </div>
  `,
})
export class KanbanBoardComponent {
  private _columns = signal<string[]>([]);
  private _cards = signal<KanbanCard[]>([]);
  @Input() set columns(v: string[]) { this._columns.set(v); }
  get columns() { return this._columns(); }
  @Input() set cards(v: KanbanCard[]) { this._cards.set(v); }
  get cards() { return this._cards(); }
  @Output() move = new EventEmitter<{ id: string; column: string }>();

  hover = signal('');

  cardsByColumn = computed(() => {
    const map: Record<string, KanbanCard[]> = {};
    for (const col of this._columns()) map[col] = [];
    for (const card of this._cards()) (map[card.column] ??= []).push(card);
    return map;
  });

  drop(ev: DragEvent, column: string) {
    ev.preventDefault();
    this.hover.set('');
    const id = ev.dataTransfer?.getData('text/plain');
    if (id) this.move.emit({ id, column });
  }

  private dotColors = ['#2d13ea', '#e3a008', '#0e9f6e', '#0f9c8f'];
  colDotColor(i: number): string {
    return this.dotColors[i % this.dotColors.length];
  }
}
