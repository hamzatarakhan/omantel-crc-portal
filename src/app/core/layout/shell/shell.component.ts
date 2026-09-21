import { Component, effect, inject, signal, untracked } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { TopbarComponent } from '../topbar/topbar.component';
import { CrcStore } from '../../services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { AccrualForecast } from '../../services/forecast.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, MatIconModule, SidebarComponent, TopbarComponent],
  template: `
    <div class="h-screen w-screen flex overflow-hidden bg-surface-subtle">
      <app-sidebar [mobileOpen]="mobileNavOpen()" (closeMobile)="mobileNavOpen.set(false)"></app-sidebar>
      <div class="flex-1 flex flex-col min-w-0">
        <app-topbar (menuClick)="mobileNavOpen.set(true)"></app-topbar>

        @if (store.currentRole() !== 'System Admin') {
          <div class="shrink-0 flex items-center gap-2 px-4 sm:px-6 py-2 bg-brand-50 border-b border-brand-100 text-xs text-brand-800">
            <mat-icon class="!text-base shrink-0">visibility</mat-icon>
            <span class="flex-1 min-w-0">Viewing the portal as <strong>{{ store.currentRole() }}</strong> &mdash; you only see the screens and actions this role is allowed.</span>
            <button class="font-semibold underline underline-offset-2 whitespace-nowrap hover:text-brand-900" (click)="store.switchRole('System Admin')">Back to System Admin</button>
          </div>
        }

        <main class="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>

    @if (store.roleSwitching(); as role) {
      <div class="fixed inset-0 z-[1000] flex items-center justify-center bg-white/80 backdrop-blur-sm" role="status" aria-live="polite">
        <div class="surface-card px-8 py-7 w-[min(400px,90vw)] text-center">
          <div class="w-14 h-14 rounded-full mx-auto mb-4 border-4 border-brand-100 border-t-brand-600 animate-spin"></div>
          <div class="text-[11px] font-bold uppercase tracking-wider text-ink-400">Switching view</div>
          <div class="text-lg font-extrabold text-ink-900 mt-1">{{ role }}</div>
          <p class="text-xs text-ink-500 mt-1.5">Loading the screens, permissions and actions for this role&hellip;</p>
          <div class="h-1.5 rounded-full bg-surface-subtle mt-5 overflow-hidden"><div class="role-progress h-full rounded-full bg-brand-600"></div></div>
        </div>
      </div>
    }
  `,
})
export class ShellComponent {
  store = inject(CrcStore);
  private router = inject(Router);
  private ui = inject(UiService);
  private accrual = inject(AccrualForecast); // keeps the accrual forecast listening for approved invoices on every screen
  mobileNavOpen = signal(false);

  private lastRole = this.store.currentRole();

  constructor() {
    // When the role (or the permission matrix) changes and the open screen is no longer allowed, move to the role's home.
    effect(() => {
      const role = this.store.currentRole();
      this.store.permissionGrid();
      untracked(() => {
        const changed = role !== this.lastRole;
        this.lastRole = role;
        if (!this.store.canAccessUrl(this.router.url)) {
          this.router.navigateByUrl(this.store.landingRoute());
          this.ui.toast(`Switched to the ${role} view — that screen isn't part of this role, so its home screen was opened.`, 5000);
        } else if (changed) {
          this.ui.toast(`Now viewing the portal as ${role}.`, 3000);
        }
      });
    });
  }
}
