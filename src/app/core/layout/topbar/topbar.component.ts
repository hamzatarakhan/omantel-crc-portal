import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { CrcStore, ROLES, ROLE_SUMMARY, timeAgo } from '../../services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { AppNotification } from '../../models/domain';

interface SearchResult {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  link: any[];
}

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatIconModule, MatMenuModule, MatBadgeModule],
  template: `
    <header class="relative h-16 bg-white border-b border-surface-border flex items-center gap-3 px-4 sm:px-5 shrink-0">
      <button class="w-9 h-9 rounded-lg flex items-center justify-center text-ink-500 hover:bg-surface-subtle lg:hidden shrink-0" (click)="menuClick.emit()">
        <mat-icon>menu</mat-icon>
      </button>

      <div class="relative flex-1 max-w-[240px] lg:max-w-xs hidden sm:block">
        <mat-icon class="!text-ink-400 !text-lg absolute left-3 top-1/2 -translate-y-1/2">search</mat-icon>
        <input
          [(ngModel)]="query"
          (ngModelChange)="onQueryChange()"
          (focus)="focused.set(true)"
          (blur)="onBlur()"
          (keydown.escape)="clearSearch()"
          placeholder="Search..."
          class="pl-9 pr-11 py-2 text-sm rounded-lg border border-surface-border w-full focus:outline-none focus:border-brand-400 transition-colors placeholder:text-ink-400"
        />
        <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-ink-400 border border-surface-border rounded px-1.5 py-0.5 hidden md:inline-block">&#8984;K</span>

        @if (focused() && query.trim()) {
          <div class="absolute left-0 right-0 top-full mt-2 surface-card overflow-hidden z-50">
            @if (results().length === 0) {
              <div class="px-4 py-6 text-center text-xs text-ink-400">No results for &ldquo;{{ query }}&rdquo;</div>
            } @else {
              <div class="py-1.5 max-h-80 overflow-y-auto">
                @for (r of results(); track r.id) {
                  <button (click)="goTo(r)" class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-subtle text-left transition-colors">
                    <mat-icon class="!text-lg !text-brand-500 shrink-0">{{ r.icon }}</mat-icon>
                    <div class="min-w-0">
                      <div class="text-[13px] font-medium text-ink-800 truncate">{{ r.title }}</div>
                      <div class="text-[11px] text-ink-400 truncate">{{ r.subtitle }}</div>
                    </div>
                  </button>
                }
              </div>
            }
          </div>
        }
      </div>

      @if (!mobileSearchOpen()) {
        <button class="w-9 h-9 rounded-lg flex items-center justify-center text-ink-500 hover:bg-surface-subtle sm:hidden shrink-0" (click)="mobileSearchOpen.set(true)">
          <mat-icon>search</mat-icon>
        </button>
      }

      <div class="flex-1"></div>

      <div class="flex items-center gap-1.5">
        <button class="w-9 h-9 rounded-lg hover:bg-surface-subtle flex items-center justify-center text-ink-500 transition-colors" [matMenuTriggerFor]="notifMenu" #notifTrigger="matMenuTrigger">
          <mat-icon [matBadge]="store.unreadCount()" [matBadgeHidden]="store.unreadCount() === 0" matBadgeColor="warn" matBadgeSize="small">notifications</mat-icon>
        </button>
        <mat-menu #notifMenu="matMenu" xPosition="before" class="app-menu-panel">
          <div class="w-[23rem] max-w-[90vw]" (click)="$event.stopPropagation()">
            <div class="flex items-center justify-between px-5 py-4 border-b border-surface-border">
              <div class="flex items-center gap-2">
                <span class="text-[15px] font-bold text-ink-900">Notifications</span>
                @if (store.unreadCount() > 0) {
                  <span class="text-[11px] font-bold text-brand-700 bg-brand-50 rounded-full px-2 py-0.5">{{ store.unreadCount() }} new</span>
                }
              </div>
              @if (store.unreadCount() > 0) {
                <button class="text-[12px] font-semibold text-brand-600 hover:text-brand-700 transition-colors" (click)="store.markAllRead()">Mark all as read</button>
              }
            </div>

            @if (store.notifications().length === 0) {
              <div class="px-5 py-10 text-center">
                <mat-icon class="!text-3xl !text-ink-400/60">notifications_none</mat-icon>
                <p class="text-xs text-ink-400 mt-2">You're all caught up.</p>
              </div>
            } @else {
              <div class="max-h-96 overflow-y-auto divide-y divide-surface-border">
                @for (n of store.notifications(); track n.id) {
                  <div class="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-subtle transition-colors cursor-pointer" [class.bg-brand-50]="!n.read" (click)="openNotification(n); notifTrigger.closeMenu()">
                    <span class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" [class]="badgeClass(n.level)">
                      <mat-icon class="!text-[18px]">{{ iconFor(n.level) }}</mat-icon>
                    </span>
                    <div class="min-w-0 flex-1">
                      <p class="m-0 text-[13px] text-ink-900 leading-snug" [class.font-semibold]="!n.read">{{ n.message }}</p>
                      <p class="m-0 text-[11.5px] text-ink-400 mt-0.5">{{ n.detail }} &middot; {{ ago(n) }}</p>
                    </div>
                    @if (!n.read) {
                      <span class="w-2 h-2 rounded-full bg-brand-600 shrink-0"></span>
                    }
                  </div>
                }
              </div>
            }

            <a
              routerLink="/contracts-budget/notifications"
              (click)="notifTrigger.closeMenu()"
              class="flex items-center justify-center gap-1.5 px-5 py-3 text-[12.5px] font-semibold text-ink-600 hover:text-brand-700 hover:bg-surface-subtle border-t border-surface-border transition-colors"
            >
              <mat-icon class="!text-base">settings</mat-icon>
              Manage notification settings
            </a>
          </div>
        </mat-menu>

        <button class="flex items-center gap-2 pl-1.5 pr-2 sm:pr-3 py-1.5 rounded-lg border border-transparent hover:border-surface-border hover:bg-surface-subtle transition-colors" [matMenuTriggerFor]="profileMenu">
          <div class="w-8 h-8 rounded-full bg-brand-gradient text-white flex items-center justify-center text-xs font-bold shrink-0">HT</div>
          <div class="text-left leading-tight hidden md:block">
            <div class="text-xs font-semibold text-ink-900">Hamza Tarkan</div>
            <div class="text-[11px] text-ink-400">{{ store.currentRole() }}</div>
          </div>
          <mat-icon class="!text-base !text-ink-400 hidden sm:block">expand_more</mat-icon>
        </button>
        <mat-menu #profileMenu="matMenu" xPosition="before" class="app-menu-panel">
          <div class="w-72">
            <div class="flex items-center gap-3 px-4 py-3.5 border-b border-surface-border">
              <div class="w-10 h-10 rounded-full bg-brand-gradient text-white flex items-center justify-center text-sm font-bold shrink-0">HT</div>
              <div class="min-w-0">
                <div class="text-sm font-semibold text-ink-900 truncate">Hamza Tarkan</div>
                <div class="text-[11px] text-ink-400 truncate">Signed in via Tawasul SSO</div>
              </div>
            </div>
            <div class="px-4 pt-3 pb-1 text-[10.5px] font-bold uppercase tracking-wider text-ink-400">View portal as (demo)</div>
            <div class="pb-1.5">
              @for (r of roles; track r) {
                <button (click)="switchRole(r)" class="w-full flex items-center gap-2.5 px-4 py-1.5 text-left hover:bg-surface-subtle transition-colors" [class.bg-brand-50]="r === store.currentRole()">
                  <mat-icon class="!text-lg" [class.!text-brand-600]="r === store.currentRole()" [class.!text-ink-400]="r !== store.currentRole()">{{ r === store.currentRole() ? 'radio_button_checked' : 'radio_button_unchecked' }}</mat-icon>
                  <span class="min-w-0">
                    <span class="block text-[13px]" [class.text-brand-700]="r === store.currentRole()" [class.font-semibold]="r === store.currentRole()" [class.text-ink-700]="r !== store.currentRole()">{{ r }}</span>
                    <span class="block text-[11px] text-ink-400 truncate">{{ summary[r] }}</span>
                  </span>
                </button>
              }
            </div>
            <div class="py-1.5 border-t border-surface-border">
              <button (click)="help()" class="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-ink-700 hover:bg-surface-subtle transition-colors">
                <mat-icon class="!text-lg !text-ink-400">help_outline</mat-icon>
                Help &amp; Support
              </button>
            </div>
            <div class="py-1.5 border-t border-surface-border">
              <button (click)="signOut()" class="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-status-red hover:bg-red-50 transition-colors">
                <mat-icon class="!text-lg">logout</mat-icon>
                Sign Out
              </button>
            </div>
          </div>
        </mat-menu>
      </div>

      @if (mobileSearchOpen()) {
        <div class="absolute inset-0 bg-white flex flex-col sm:hidden z-40">
          <div class="h-16 flex items-center gap-2 px-4 shrink-0">
            <mat-icon class="!text-ink-400 !text-lg shrink-0">search</mat-icon>
            <input
              [(ngModel)]="query"
              (ngModelChange)="onQueryChange()"
              (keydown.escape)="closeMobileSearch()"
              autofocus
              placeholder="Search contracts, agents..."
              class="flex-1 text-sm focus:outline-none placeholder:text-ink-400"
            />
            <button class="w-8 h-8 rounded-lg flex items-center justify-center text-ink-500 hover:bg-surface-subtle shrink-0" (click)="closeMobileSearch()">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          @if (query.trim()) {
            <div class="flex-1 overflow-y-auto border-t border-surface-border">
              @if (results().length === 0) {
                <div class="px-4 py-6 text-center text-xs text-ink-400">No results for &ldquo;{{ query }}&rdquo;</div>
              } @else {
                @for (r of results(); track r.id) {
                  <button (click)="goTo(r)" class="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-subtle text-left transition-colors">
                    <mat-icon class="!text-lg !text-brand-500 shrink-0">{{ r.icon }}</mat-icon>
                    <div class="min-w-0">
                      <div class="text-[13px] font-medium text-ink-800 truncate">{{ r.title }}</div>
                      <div class="text-[11px] text-ink-400 truncate">{{ r.subtitle }}</div>
                    </div>
                  </button>
                }
              }
            </div>
          }
        </div>
      }
    </header>
  `,
})
export class TopbarComponent {
  @Output() menuClick = new EventEmitter<void>();

  private router = inject(Router);
  store = inject(CrcStore);
  private ui = inject(UiService);
  roles = ROLES;
  summary = ROLE_SUMMARY;

  query = '';
  focused = signal(false);
  mobileSearchOpen = signal(false);

  results = signal<SearchResult[]>([]);

  private updateResults() {
    const q = this.query.trim().toLowerCase();
    if (!q) {
      this.results.set([]);
      return;
    }
    const contracts: SearchResult[] = this.store.contracts()
      .filter((c) => c.reference.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.vendorName.toLowerCase().includes(q))
      .slice(0, 4)
      .map((c) => ({ id: 'contract-' + c.id, icon: 'description', title: c.name, subtitle: `${c.reference} · ${c.vendorName}`, link: ['/contracts-budget/contracts', c.id] }));
    const agents: SearchResult[] = this.store.agents()
      .filter((a) => a.name.toLowerCase().includes(q) || a.employeeId.includes(q) || a.queue.toLowerCase().includes(q))
      .slice(0, 4)
      .map((a) => ({ id: 'agent-' + a.id, icon: 'badge', title: a.name, subtitle: `${a.queue} · ${a.vendor}`, link: ['/csr/directory', a.id] }));
    const candidates: SearchResult[] = this.store.candidates()
      .filter((c) => c.name.toLowerCase().includes(q) || c.department.toLowerCase().includes(q))
      .slice(0, 2)
      .map((c) => ({ id: 'cand-' + c.id, icon: 'person_search', title: c.name, subtitle: 'Candidate · ' + c.department + ' · ' + c.status, link: ['/csr/recruitment'] }));
    this.results.set([...contracts, ...agents, ...candidates].slice(0, 7));
  }

  onQueryChange() {
    this.updateResults();
  }

  onBlur() {
    setTimeout(() => this.focused.set(false), 150);
  }

  clearSearch() {
    this.query = '';
    this.results.set([]);
  }

  closeMobileSearch() {
    this.mobileSearchOpen.set(false);
    this.query = '';
    this.results.set([]);
  }

  goTo(result: SearchResult) {
    this.router.navigate(result.link);
    this.clearSearch();
    this.focused.set(false);
    this.mobileSearchOpen.set(false);
  }

  ago(n: AppNotification) {
    return timeAgo(n.createdAt);
  }

  openNotification(n: AppNotification) {
    this.store.markRead(n.id);
    if (n.link) this.router.navigateByUrl(n.link);
  }

  switchRole(role: string) {
    this.store.switchRole(role);
  }

  help() {
    this.ui.confirm({ title: 'Help & Support', message: 'CRC support: crc-support@omantel.om · Tawasul service desk ext. 4400 (Sun–Thu, 7:30–15:30).', confirmLabel: 'Copy email', icon: 'support_agent' })
      .then((copy) => { if (copy) { navigator.clipboard?.writeText('crc-support@omantel.om'); this.ui.toast('Support email copied.'); } });
  }

  signOut() {
    this.ui.confirm({ title: 'Sign out?', message: 'You will be signed out of the CRC portal. (Demo: the session simply continues after you confirm.)', confirmLabel: 'Sign out', danger: true, icon: 'logout' })
      .then((ok) => { if (ok) this.ui.toast('Signed out — demo session restored.'); });
  }

  badgeClass(level: AppNotification['level']): string {
    return {
      amber: 'bg-amber-50 text-status-amber',
      red: 'bg-red-50 text-status-red',
      info: 'bg-brand-50 text-brand-600',
      green: 'bg-emerald-50 text-status-normal',
    }[level];
  }

  iconFor(level: AppNotification['level']): string {
    return { amber: 'schedule', red: 'priority_high', info: 'info', green: 'check_circle' }[level];
  }
}
