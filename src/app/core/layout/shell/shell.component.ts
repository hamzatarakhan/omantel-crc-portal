import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { TopbarComponent } from '../topbar/topbar.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent],
  template: `
    <div class="h-screen w-screen flex overflow-hidden bg-surface-subtle">
      <app-sidebar [mobileOpen]="mobileNavOpen()" (closeMobile)="mobileNavOpen.set(false)"></app-sidebar>
      <div class="flex-1 flex flex-col min-w-0">
        <app-topbar (menuClick)="mobileNavOpen.set(true)"></app-topbar>
        <main class="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
})
export class ShellComponent {
  mobileNavOpen = signal(false);
}
