import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

interface RolePermission { permission: string; module: string; }

@Component({
  selector: 'app-access-control',
  standalone: true,
  imports: [CommonModule, MatCheckboxModule, PageHeaderComponent],
  template: `
    <app-page-header
      title="Access Control"
      subtitle="Role-based permissions across all four modules"
      [breadcrumbs]="[{ label: 'Administration' }, { label: 'Access Control' }]"
    ></app-page-header>

    <div class="surface-card overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-surface-subtle text-left text-xs text-ink-500 uppercase tracking-wide">
            <th class="px-4 py-2.5 font-medium">Permission</th>
            <th class="px-4 py-2.5 font-medium">Module</th>
            @for (role of roles; track role) {
              <th class="px-4 py-2.5 font-medium text-center">{{ role }}</th>
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
                  <mat-checkbox [checked]="granted(p, role)"></mat-checkbox>
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class AccessControlComponent {
  roles = ['Contract Mgmt Team', 'Budget Owner', 'CSR/Workforce Team', 'Team Lead', 'Finance', 'System Admin'];

  permissions: RolePermission[] = [
    { permission: 'View Contracts', module: 'Contracts & Budget' },
    { permission: 'Manual Contract Sync', module: 'Contracts & Budget' },
    { permission: 'Prepare/Edit Draft Budget', module: 'Contracts & Budget' },
    { permission: 'Approve Budget', module: 'Contracts & Budget' },
    { permission: 'View Agent Profiles', module: 'CSR Management' },
    { permission: 'Manage Recruitment', module: 'CSR Management' },
    { permission: 'Create Movement Announcement', module: 'Internal Project Movement' },
    { permission: 'Review/Approve Movement Requests', module: 'Internal Project Movement' },
    { permission: 'Validate Invoice', module: 'Invoicing & Payments' },
    { permission: 'Configure Payable Rules', module: 'Invoicing & Payments' },
  ];

  granted(p: RolePermission, role: string): boolean {
    if (role === 'System Admin') return true;
    if (p.permission.includes('Approve Budget') && role !== 'Budget Owner') return false;
    if (p.module === 'Contracts & Budget') return role === 'Contract Mgmt Team' || role === 'Budget Owner' || role === 'Finance';
    if (p.module === 'CSR Management') return role === 'CSR/Workforce Team' || role === 'Team Lead';
    if (p.module === 'Internal Project Movement') return role === 'Team Lead' || role === 'CSR/Workforce Team';
    if (p.module === 'Invoicing & Payments') return role === 'Finance';
    return false;
  }
}
