import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { UiService } from '../../../shared/services/ui.service';
import { BudgetCategory, BudgetConfig, ListKind } from '../../../core/services/budget-config.service';
import { BudgetCycle } from '../../../core/services/budget-cycle.service';
import { ProjectRequests } from '../../../core/services/project-requests.service';

const FIELD = 'flex-1 min-w-0 px-3 py-2 text-sm rounded-lg border border-surface-border bg-white text-ink-800 focus:outline-none focus:border-brand-400';

/** SRS §2, §5.2 and BR-PRJ-007: the lists an administrator can configure. A value that is in use cannot be removed. */
@Component({
  selector: 'app-budget-settings',
  standalone: true,
  imports: [CommonModule, MatIconModule, PageHeaderComponent],
  template: `
    <app-page-header
      title="Budget Settings"
      subtitle="Configure the project statuses, priorities, resource categories, departments and budget categories. Every change is in the audit log."
      [breadcrumbs]="[{ label: 'Contracts & Budget', link: '/contracts-budget/dashboard' }, { label: 'Budget' }, { label: 'Budget Settings' }]"
    ></app-page-header>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      @for (l of lists; track l.kind) {
        <section class="surface-card px-5 py-4">
          <h3 class="text-[13.5px] font-bold text-ink-900">{{ l.title }}</h3>
          <p class="text-xs text-ink-400 mt-0.5 mb-3">{{ l.hint }}</p>
          <div class="flex flex-wrap gap-1.5 mb-3">
            @for (v of values(l.kind); track v) {
              <span class="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg bg-surface-subtle border border-surface-border text-xs font-semibold text-ink-700">{{ v }}
                <button class="w-5 h-5 rounded flex items-center justify-center text-ink-400 hover:bg-white hover:text-status-red" (click)="remove(l.kind, v)" [title]="'Remove ' + v"><mat-icon class="!text-[15px] !w-[15px] !h-[15px] !leading-[15px]">close</mat-icon></button></span>
            }
          </div>
          <div class="flex gap-2"><input #i [class]="field" [placeholder]="'Add a ' + l.title.toLowerCase()" (keyup.enter)="add(l.kind, i)"><button class="btn" (click)="add(l.kind, i)">Add</button></div>
        </section>
      }

      <section class="surface-card px-5 py-4 xl:col-span-2">
        <h3 class="text-[13.5px] font-bold text-ink-900">Budget categories and items</h3>
        <p class="text-xs text-ink-400 mt-0.5 mb-3">The items under Petty Cash are the choices when a petty cash line is added. Outsourcing, Petty Cash and Projects are used by the budget screens and stay.</p>
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          @for (c of cfg.categories(); track c.name) {
            <div class="rounded-lg border border-surface-border p-3">
              <div class="flex items-center justify-between"><span class="text-sm font-bold text-ink-900">{{ c.name }}</span>
                <button class="text-xs font-semibold text-ink-400 hover:text-status-red" (click)="removeCategory(c.name)">Remove</button></div>
              <div class="flex flex-wrap gap-1.5 my-2.5 min-h-6">
                @for (it of c.items; track it) {
                  <span class="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md bg-surface-subtle text-xs font-medium text-ink-700">{{ it }}
                    <button class="w-4 h-4 rounded flex items-center justify-center text-ink-400 hover:text-status-red" (click)="removeItem(c, it)" [title]="'Remove ' + it"><mat-icon class="!text-[13px] !w-[13px] !h-[13px] !leading-[13px]">close</mat-icon></button></span>
                } @empty { <span class="text-xs text-ink-400">No items yet</span> }
              </div>
              <div class="flex gap-2"><input #ii [class]="field" placeholder="Add an item" (keyup.enter)="addItem(c.name, ii)"><button class="btn" (click)="addItem(c.name, ii)">Add</button></div>
            </div>
          }
        </div>
        <div class="flex gap-2 mt-4 max-w-md"><input #nc [class]="field" placeholder="New budget category" (keyup.enter)="addCategory(nc)"><button class="btn" (click)="addCategory(nc)">Add category</button></div>
      </section>
    </div>
  `,
  styles: [`.btn { padding: 0 14px; border-radius: 8px; font-size: 13px; font-weight: 600; color: #ea6e00; border: 1px solid #ea6e00; background: #fff; white-space: nowrap; } .btn:hover { background: #fff4ea; }`],
})
export class BudgetSettingsComponent {
  cfg = inject(BudgetConfig);
  private cycle = inject(BudgetCycle);
  private projects = inject(ProjectRequests);
  private ui = inject(UiService);

  field = FIELD;
  lists: Array<{ kind: ListKind; title: string; hint: string }> = [
    { kind: 'statuses', title: 'Project status', hint: 'What a project request is about: renewal, cancellation, new project, extension.' },
    { kind: 'priorities', title: 'Priority', hint: 'The priority a requester can give a project.' },
    { kind: 'resourceCategories', title: 'Resource category', hint: 'The outsourcing layers (PO1, PO2, PO3) offered when a resource category is added.' },
    { kind: 'departments', title: 'Department', hint: 'Used on project requests and for the cut-off date of the budget cycle.' },
  ];

  values = (k: ListKind) => ({ statuses: this.cfg.statuses, priorities: this.cfg.priorities, resourceCategories: this.cfg.resourceCategories, departments: this.cfg.departments })[k]();

  private used = computed(() => {
    const ps = this.projects.projects();
    return {
      statuses: (v: string) => ps.filter((p) => p.projectStatus === v).length,
      priorities: (v: string) => ps.filter((p) => p.priority === v).length,
      departments: (v: string) => ps.filter((p) => p.department === v).length + (this.cycle.settings().departments.includes(v) ? 1 : 0),
      resourceCategories: (v: string) => this.cycle.outsourcing().filter((l) => l.category === v).length,
    };
  });

  private say(err: string | null, ok: string) { this.ui.toast(err ?? ok, err ? 5000 : 2500); return !err; }

  add(kind: ListKind, el: HTMLInputElement) { if (this.say(this.cfg.add(kind, el.value), 'Added.')) el.value = ''; }
  remove(kind: ListKind, v: string) { this.say(this.cfg.remove(kind, v, this.used()[kind](v)), 'Removed.'); }

  addCategory(el: HTMLInputElement) { if (this.say(this.cfg.addCategory(el.value), 'Category added.')) el.value = ''; }
  removeCategory(name: string) { this.say(this.cfg.removeCategory(name), 'Category removed.'); }
  addItem(category: string, el: HTMLInputElement) { if (this.say(this.cfg.addItem(category, el.value), 'Item added.')) el.value = ''; }
  removeItem(c: BudgetCategory, item: string) {
    const used = c.name === 'Petty Cash' ? this.cycle.petty().filter((l) => l.category === item).length : 0;
    this.say(this.cfg.removeItem(c.name, item, used), 'Item removed.');
  }
}
