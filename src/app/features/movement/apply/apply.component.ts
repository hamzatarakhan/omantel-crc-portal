import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-apply',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, PageHeaderComponent],
  template: `
    <app-page-header
      title="Agent Application &mdash; Retention Growth Squad"
      subtitle="Reached via the unique link from the movement announcement email"
      [breadcrumbs]="[{ label: 'Internal Project Movement', link: '/movement/dashboard' }, { label: 'Apply for Movement' }]"
    ></app-page-header>

    @if (submitted()) {
      <div class="surface-card p-8 max-w-xl text-center">
        <div class="w-12 h-12 rounded-full bg-emerald-50 text-status-normal flex items-center justify-center mx-auto mb-3">
          <mat-icon class="!text-2xl">check</mat-icon>
        </div>
        <h3 class="text-sm font-bold text-ink-900">Application submitted</h3>
        <p class="text-xs text-ink-500 mt-1">You and your current manager will be notified once this request is reviewed.</p>
      </div>
    } @else {
      <form #f="ngForm" (ngSubmit)="submit(f)" class="surface-card p-6 max-w-xl flex flex-col gap-5">
        <div>
          <label class="text-sm font-medium text-ink-700 block mb-1.5">Agent ID <span class="text-status-red">*</span></label>
          <input
            name="agentId"
            ngModel
            required
            #agentId="ngModel"
            class="w-full px-3 py-2.5 text-sm rounded-lg border transition-colors focus:outline-none"
            [class.border-surface-border]="agentId.valid || agentId.untouched"
            [class.focus:border-brand-400]="agentId.valid || agentId.untouched"
            [class.border-status-red]="agentId.invalid && agentId.touched"
          />
        </div>

        <div>
          <label class="text-sm font-medium text-ink-700 block mb-1.5">Full Name <span class="text-status-red">*</span></label>
          <input
            name="fullName"
            ngModel
            required
            #fullName="ngModel"
            class="w-full px-3 py-2.5 text-sm rounded-lg border transition-colors focus:outline-none"
            [class.border-surface-border]="fullName.valid || fullName.untouched"
            [class.focus:border-brand-400]="fullName.valid || fullName.untouched"
            [class.border-status-red]="fullName.invalid && fullName.touched"
          />
        </div>

        <div>
          <label class="text-sm font-medium text-ink-700 block mb-1.5">Contact Information <span class="text-status-red">*</span></label>
          <input
            name="contact"
            ngModel
            required
            #contact="ngModel"
            placeholder="Email or phone number"
            class="w-full px-3 py-2.5 text-sm rounded-lg border transition-colors focus:outline-none placeholder:text-ink-400"
            [class.border-surface-border]="contact.valid || contact.untouched"
            [class.focus:border-brand-400]="contact.valid || contact.untouched"
            [class.border-status-red]="contact.invalid && contact.touched"
          />
        </div>

        <div>
          <label class="text-sm font-medium text-ink-700 block mb-1.5">Desired Movement Duration <span class="text-status-red">*</span></label>
          <div class="relative">
            <select
              name="duration"
              ngModel
              required
              class="w-full px-3 py-2.5 pr-9 text-sm rounded-lg border border-surface-border focus:outline-none focus:border-brand-400 transition-colors bg-white appearance-none"
            >
              <option value="" disabled selected>Select duration</option>
              @for (m of durations; track m) {
                <option [value]="m">{{ m }} month{{ m > 1 ? 's' : '' }}</option>
              }
            </select>
            <mat-icon class="!text-lg !text-ink-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">expand_more</mat-icon>
          </div>
        </div>

        <div>
          <label class="text-sm font-medium text-ink-700 block mb-1.5">Justification <span class="text-status-red">*</span></label>
          <textarea
            name="justification"
            ngModel
            required
            rows="4"
            placeholder="Briefly explain why you're a fit for this movement"
            class="w-full px-3 py-2.5 text-sm rounded-lg border border-surface-border focus:outline-none focus:border-brand-400 transition-colors resize-y placeholder:text-ink-400"
          ></textarea>
        </div>

        <button mat-flat-button color="primary" type="submit" [disabled]="f.invalid" class="self-start">Submit Application</button>
      </form>
    }
  `,
})
export class ApplyComponent {
  durations = Array.from({ length: 12 }, (_, i) => i + 1);
  submitted = signal(false);

  submit(f: NgForm) {
    if (f.invalid) return;
    this.submitted.set(true);
  }
}
