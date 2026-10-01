import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { CrcStore } from '../../../core/services/crc-store.service';

/** The single entry point into the app: a vendor signs in here to reach the Vendor Claiming Portal, or a CRC staff member continues straight into the admin portal — same page, two tabs. */
@Component({
  selector: 'app-vendor-login',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  template: `
    <div class="min-h-screen w-full flex items-center justify-center bg-surface-subtle px-4">
      <div class="w-full max-w-[400px]">
        <div class="flex items-center gap-2.5 justify-center mb-6">
          <div class="w-10 h-10 rounded-xl bg-brand-gradient text-white flex items-center justify-center font-bold">O</div>
          <div class="text-left leading-tight">
            <div class="text-sm font-extrabold text-ink-900">Omantel CRC Portal</div>
            <div class="text-[11px] text-ink-400">Sign in to continue</div>
          </div>
        </div>

        <div class="flex items-center gap-1 p-1.5 bg-surface-subtle border border-surface-border rounded-xl mb-4">
          <button type="button" class="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition-all" [class]="mode() === 'vendor' ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500 hover:text-ink-800'" (click)="mode.set('vendor')">
            <mat-icon class="!text-lg">storefront</mat-icon>Vendor
          </button>
          <button type="button" class="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition-all" [class]="mode() === 'billing' ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500 hover:text-ink-800'" (click)="mode.set('billing')">
            <mat-icon class="!text-lg">receipt_long</mat-icon>Billing
          </button>
          <button type="button" class="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition-all" [class]="mode() === 'staff' ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500 hover:text-ink-800'" (click)="mode.set('staff')">
            <mat-icon class="!text-lg">admin_panel_settings</mat-icon>CRC Staff
          </button>
        </div>

        <div class="surface-card overflow-hidden">
          <div class="px-6 py-7">
            @if (mode() === 'vendor') {
              <h1 class="text-base font-bold text-ink-900">Vendor sign in</h1>
              <p class="text-xs text-ink-500 mt-1">Sign in to submit invoice claims against your active contracts.</p>

              <form class="mt-5 space-y-4" (ngSubmit)="submit()">
                <div>
                  <label class="text-[13px] font-medium text-ink-700 block mb-1.5">Vendor email</label>
                  <input [(ngModel)]="email" name="email" type="email" required placeholder="accounts@yourcompany.om"
                    class="w-full px-3 py-2.5 text-sm rounded-lg border border-surface-border bg-white focus:outline-none focus:border-brand-400 transition-colors placeholder:text-ink-400" />
                </div>
                <div>
                  <label class="text-[13px] font-medium text-ink-700 block mb-1.5">Password</label>
                  <input [(ngModel)]="password" name="password" type="password" required placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                    class="w-full px-3 py-2.5 text-sm rounded-lg border border-surface-border bg-white focus:outline-none focus:border-brand-400 transition-colors placeholder:text-ink-400" />
                  <p class="text-[11px] text-ink-400 mt-1">Demo prototype — any password is accepted for a known vendor email.</p>
                </div>

                @if (error()) {
                  <div class="flex items-center gap-2 text-[13px] text-status-red bg-red-50 rounded-lg px-3 py-2">
                    <mat-icon class="!text-lg shrink-0">error_outline</mat-icon>{{ error() }}
                  </div>
                }

                <button type="submit" class="w-full px-4 py-2.5 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors">Sign in</button>
              </form>

              <div class="mt-5 pt-4 border-t border-surface-border">
                <p class="text-[11px] font-bold uppercase tracking-wider text-ink-400 mb-1.5">Demo vendor accounts</p>
                <button type="button" class="block w-full text-left text-[12.5px] text-brand-700 hover:underline" (click)="fill('accounts@infoline.om')">accounts&commat;infoline.om &mdash; Infoline LLC</button>
                <button type="button" class="block w-full text-left text-[12.5px] text-brand-700 hover:underline" (click)="fill('billing@greenumbrella.om')">billing&commat;greenumbrella.om &mdash; Green Umbrella Services</button>
              </div>
            } @else if (mode() === 'billing') {
              <h1 class="text-base font-bold text-ink-900">Billing</h1>
              <p class="text-xs text-ink-500 mt-1">Continue into the billing portal — same screens and features as the admin portal for now.</p>
              <p class="text-[11px] text-ink-400 mt-3">Demo prototype — there is no real billing login yet; its permissions and rules are still to be decided.</p>
              <button type="button" class="w-full mt-5 px-4 py-2.5 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors" (click)="continueAsBilling()">Continue to Billing Portal</button>
            } @else {
              <h1 class="text-base font-bold text-ink-900">CRC staff</h1>
              <p class="text-xs text-ink-500 mt-1">Continue into the internal CRC admin portal — contracts, budgets, reconciliation and more.</p>
              <p class="text-[11px] text-ink-400 mt-3">Demo prototype — there is no real staff login yet (Tawasul SSO is not wired up); continuing opens the portal as the default System Admin, and you can preview any other internal role from the topbar once inside.</p>
              <button type="button" class="w-full mt-5 px-4 py-2.5 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors" (click)="continueAsStaff()">Continue to Admin Portal</button>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class VendorLoginComponent {
  private store = inject(CrcStore);
  private router = inject(Router);

  mode = signal<'vendor' | 'billing' | 'staff'>('vendor');
  email = '';
  password = '';
  error = signal('');

  fill(email: string) {
    this.email = email;
    this.password = 'demo';
  }

  submit() {
    const user = this.store.vendorLogin(this.email);
    if (!user) {
      this.error.set('No vendor account found for that email.');
      return;
    }
    this.error.set('');
    this.router.navigateByUrl(this.store.landingRoute());
  }

  continueAsBilling() {
    this.store.vendorLogout();
    this.store.setRole('Billing');
    this.router.navigateByUrl(this.store.landingRoute());
  }

  continueAsStaff() {
    this.store.vendorLogout();
    this.router.navigateByUrl(this.store.landingRoute());
  }
}
