import { Injectable, inject, signal } from '@angular/core';
import { CrcStore } from './crc-store.service';
import { PRIORITIES, PROJECT_STATUSES } from './project-data';

export type ListKind = 'statuses' | 'priorities' | 'resourceCategories' | 'departments';
export interface BudgetCategory { name: string; items: string[] }

/**
 * Lists an administrator can configure (SRS §2, §5.2, BR-PRJ-007): project statuses, priorities, budget categories and their items,
 * outsourcing resource categories (the PO1/PO2/PO3 layers) and departments. Every change goes to the audit log.
 */
@Injectable({ providedIn: 'root' })
export class BudgetConfig {
  private store = inject(CrcStore);

  readonly statuses = signal<string[]>([...PROJECT_STATUSES]);
  readonly priorities = signal<string[]>([...PRIORITIES]);
  readonly resourceCategories = signal<string[]>(['Bachelor tier (PO1)', 'Diploma tier (PO2)', 'Non-Diploma tier (PO3 - Outsource)']);
  readonly departments = signal<string[]>(['Customer Care Unit', 'Contact Center', 'Project Office']);
  readonly categories = signal<BudgetCategory[]>([
    { name: 'Outsourcing', items: ['Resource salaries', 'Incentives', 'Overtime'] },
    { name: 'Petty Cash', items: ['Office supplies', 'Travel reimbursements', 'Minor repairs', 'Administrative expenses', 'Other approved petty-cash items'] },
    { name: 'Projects', items: ['Renewals', 'Cancellations', 'New projects', 'Extensions'] },
    { name: 'OJT', items: ['On-job training'] },
    { name: 'Head Count', items: ['By team', 'By project', 'By outsourcing arrangement'] },
  ]);

  readonly titles: Record<ListKind, string> = { statuses: 'Project status', priorities: 'Priority', resourceCategories: 'Resource category', departments: 'Department' };
  private list = (k: ListKind) => (k === 'statuses' ? this.statuses : k === 'priorities' ? this.priorities : k === 'resourceCategories' ? this.resourceCategories : this.departments);

  /** Items under the Petty Cash category — the choices when a petty cash line is added. */
  pettyItems = () => this.categories().find((c) => c.name === 'Petty Cash')?.items ?? [];

  private note(action: string, ref: string, details: string, before?: string, after?: string) {
    this.store.log(action, ref, details, 'Success', undefined, { previousValue: before, newValue: after });
  }

  add(kind: ListKind, value: string): string | null {
    const v = value.trim(), l = this.list(kind);
    if (!v) return `Enter the ${this.titles[kind].toLowerCase()}.`;
    if (l().some((x) => x.toLowerCase() === v.toLowerCase())) return `"${v}" is already in the list.`;
    l.update((x) => [...x, v]);
    this.note('Budget List Changed', this.titles[kind], `Added "${v}".`, undefined, v);
    return null;
  }

  /** `usedBy` is how many records use the value; a value in use cannot be removed. */
  remove(kind: ListKind, value: string, usedBy: number): string | null {
    if (usedBy > 0) return `"${value}" is used by ${usedBy} record(s), so it cannot be removed.`;
    if (this.list(kind)().length <= 1) return 'The list needs at least one value.';
    this.list(kind).update((x) => x.filter((y) => y !== value));
    this.note('Budget List Changed', this.titles[kind], `Removed "${value}".`, value, undefined);
    return null;
  }

  addCategory(name: string): string | null {
    const v = name.trim();
    if (!v) return 'Enter the category name.';
    if (this.categories().some((c) => c.name.toLowerCase() === v.toLowerCase())) return `"${v}" already exists.`;
    this.categories.update((l) => [...l, { name: v, items: [] }]);
    this.note('Budget Category Changed', v, 'Category added.', undefined, v);
    return null;
  }

  removeCategory(name: string): string | null {
    if (['Outsourcing', 'Petty Cash', 'Projects'].includes(name)) return `"${name}" is used by the budget screens and cannot be removed.`;
    this.categories.update((l) => l.filter((c) => c.name !== name));
    this.note('Budget Category Changed', name, 'Category removed.', name, undefined);
    return null;
  }

  addItem(category: string, item: string): string | null {
    const v = item.trim();
    if (!v) return 'Enter the budget item.';
    const c = this.categories().find((x) => x.name === category);
    if (!c) return 'Category not found.';
    if (c.items.some((x) => x.toLowerCase() === v.toLowerCase())) return `"${v}" is already under ${category}.`;
    this.categories.update((l) => l.map((x) => (x.name === category ? { ...x, items: [...x.items, v] } : x)));
    this.note('Budget Category Changed', category, `Item "${v}" added.`, undefined, v);
    return null;
  }

  /** `usedBy` counts the petty cash lines that use the item. */
  removeItem(category: string, item: string, usedBy = 0): string | null {
    if (usedBy > 0) return `"${item}" is used by ${usedBy} budget line(s), so it cannot be removed.`;
    this.categories.update((l) => l.map((x) => (x.name === category ? { ...x, items: x.items.filter((y) => y !== item) } : x)));
    this.note('Budget Category Changed', category, `Item "${item}" removed.`, item, undefined);
    return null;
  }
}
