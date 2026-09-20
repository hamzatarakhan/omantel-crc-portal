import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { CrcStore, PERMISSIONS, ROLES } from '../../../core/services/crc-store.service';
import { UiService } from '../../../shared/services/ui.service';
import { AppUser } from '../../../core/models/domain';

@Component({
  selector: 'app-access-control',
  standalone: true,
  imports: [CommonModule, MatCheckboxModule, MatButtonModule, MatIconModule, MatSlideToggleModule, PageHeaderComponent],
  template: `
    <app-page-header
      title="Access Control"
      subtitle="Role-based permissions across all four modules &middot; changes take effect immediately (switch role from the profile menu to try them)"
      [breadcrumbs]="[{ label: 'Administration' }, { label: 'Access Control' }]"
    >
      <button mat-flat-button color="primary" (click)="addUser()"><mat-icon class="!text-base !mr-1">person_add</mat-icon>Add user</button>
    </app-page-header>

    <div class="surface-card overflow-x-auto mb-6">
      <div class="px-4 pt-3.5"><h3 class="text-[13.5px] font-bold text-ink-900">Permission matrix</h3></div>
      <table class="w-full text-sm mt-3">
        <thead>
          <tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide">
            <th class="px-4 py-2.5 font-medium">Permission</th>
            <th class="px-4 py-2.5 font-medium">Module</th>
            @for (role of roles; track role) {
              <th class="px-4 py-2.5 font-medium text-center" [class.text-brand-700]="role === store.currentRole()">{{ role }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (p of permissions; track p.permission) {
            <tr class="border-t border-surface-border">
              <td class="px-4 py-2 font-medium text-ink-700">{{ p.permission }}</td>
              <td class="px-4 py-2 text-ink-500">{{ p.module }}</td>
              @for (role of roles; track role) {
                <td class="px-4 py-2 text-center">
                  <mat-checkbox [checked]="store.permissionGrid()[p.permission + '|' + role]" (change)="toggle(p.permission, role)"></mat-checkbox>
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>

    <div class="surface-card overflow-x-auto">
      <div class="px-4 pt-3.5"><h3 class="text-[13.5px] font-bold text-ink-900">Users</h3></div>
      <table class="w-full text-sm mt-3">
        <thead>
          <tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide">
            <th class="px-4 py-2.5 font-medium">Name</th><th class="px-4 py-2.5 font-medium">Email</th><th class="px-4 py-2.5 font-medium">Role</th><th class="px-4 py-2.5 font-medium text-center">Active</th>
          </tr>
        </thead>
        <tbody>
          @for (u of store.users(); track u.id) {
            <tr class="border-t border-surface-border">
              <td class="px-4 py-2 font-medium text-ink-900">{{ u.name }}</td>
              <td class="px-4 py-2 text-ink-500">{{ u.email }}</td>
              <td class="px-4 py-2">
                <select class="border border-surface-border rounded-lg px-2 py-1 text-xs font-semibold bg-white focus:outline-none focus:border-brand-400" [value]="u.role" (change)="setRole(u, $any($event.target).value)">
                  @for (r of roles; track r) { <option [value]="r" [selected]="r === u.role">{{ r }}</option> }
                </select>
              </td>
              <td class="px-4 py-2 text-center"><mat-slide-toggle [checked]="u.active" (change)="setActive(u)"></mat-slide-toggle></td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class AccessControlComponent {
  store = inject(CrcStore);
  private ui = inject(UiService);

  roles = ROLES;
  permissions = PERMISSIONS;

  private admin(): boolean {
    if (this.store.currentRole() === 'System Admin') return true;
    this.ui.toast('Only a System Admin can change access control. Switch role from the profile menu.', 4500);
    return false;
  }

  toggle(permission: string, role: string) {
    if (!this.admin()) {
      // undo the checkbox visual by re-reading the grid
      this.store.permissionGrid.update((g) => ({ ...g }));
      return;
    }
    this.store.togglePermission(permission, role);
  }

  setRole(u: AppUser, role: string) {
    if (!this.admin()) { this.store.users.update((l) => [...l]); return; }
    this.store.updateUser(u.id, { role });
    this.ui.toast(`${u.name} is now ${role}.`);
  }

  setActive(u: AppUser) {
    if (!this.admin()) { this.store.users.update((l) => [...l]); return; }
    this.store.updateUser(u.id, { active: !u.active });
    this.ui.toast(`${u.name} ${u.active ? 'deactivated' : 'activated'}.`);
  }

  async addUser() {
    if (!this.admin()) return;
    const v = await this.ui.form({
      title: 'Add user', subtitle: 'Users sign in through Tawasul SSO; this sets their CRC role', icon: 'person_add', submitLabel: 'Add user',
      values: { role: 'Contract Mgmt Team' },
      fields: [
        { key: 'name', label: 'Full name', required: true },
        { key: 'email', label: 'Email', type: 'email', required: true, placeholder: 'name@omantel.om' },
        { key: 'role', label: 'Role', type: 'select', options: this.roles, required: true },
      ],
    });
    if (!v) return;
    this.store.addUser({ name: v['name'], email: v['email'], role: v['role'] });
    this.ui.toast(`${v['name']} added as ${v['role']}.`);
  }
}
