import { Routes } from '@angular/router';
import { ShellComponent } from './core/layout/shell/shell.component';
import { roleGuard } from './core/role.guard';

export const routes: Routes = [
  {
    path: '',
    component: ShellComponent,
    canActivateChild: [roleGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'contracts-budget/dashboard' },

      // Contracts & Budget
      { path: 'contracts-budget/dashboard', loadComponent: () => import('./features/contracts-budget/contract-dashboard/contract-dashboard.component').then((m) => m.ContractDashboardComponent) },
      { path: 'contracts-budget/contracts', loadComponent: () => import('./features/contracts-budget/contract-list/contract-list.component').then((m) => m.ContractListComponent) },
      { path: 'contracts-budget/contracts/:id', loadComponent: () => import('./features/contracts-budget/contract-detail/contract-detail.component').then((m) => m.ContractDetailComponent) },
      { path: 'contracts-budget/trends', loadComponent: () => import('./features/contracts-budget/contract-trends/contract-trends.component').then((m) => m.ContractTrendsComponent) },
      { path: 'contracts-budget/needs-attention', loadComponent: () => import('./features/contracts-budget/needs-attention/needs-attention.component').then((m) => m.NeedsAttentionComponent) },
      { path: 'contracts-budget/sync', loadComponent: () => import('./features/contracts-budget/sync-overview/sync-overview.component').then((m) => m.SyncOverviewComponent) },
      { path: 'contracts-budget/sync-errors', loadComponent: () => import('./features/contracts-budget/sync-errors/sync-errors.component').then((m) => m.SyncErrorsComponent) },
      { path: 'contracts-budget/projects', loadComponent: () => import('./features/contracts-budget/project-requests/project-requests.component').then((m) => m.ProjectRequestsComponent) },
      { path: 'contracts-budget/actions', loadComponent: () => import('./features/contracts-budget/monitoring-actions/monitoring-actions.component').then((m) => m.MonitoringActionsComponent) },
      { path: 'contracts-budget/sync-config', loadComponent: () => import('./features/contracts-budget/sync-config/sync-config.component').then((m) => m.SyncConfigComponent) },
      { path: 'contracts-budget/audit-history', loadComponent: () => import('./features/admin/audit-log/audit-log.component').then((m) => m.AuditLogComponent) },
      { path: 'contracts-budget/sync-history', loadComponent: () => import('./features/contracts-budget/sync-history/sync-history.component').then((m) => m.SyncHistoryComponent) },
      { path: 'contracts-budget/notifications', loadComponent: () => import('./features/contracts-budget/notification-config/notification-config.component').then((m) => m.NotificationConfigComponent) },
      { path: 'contracts-budget/reports', loadComponent: () => import('./features/contracts-budget/contract-reports/contract-reports.component').then((m) => m.ContractReportsComponent) },
      { path: 'contracts-budget/budget-dashboard', loadComponent: () => import('./features/contracts-budget/budget-dashboard/budget-dashboard.component').then((m) => m.BudgetDashboardComponent) },
      { path: 'contracts-budget/budget-settings', loadComponent: () => import('./features/contracts-budget/budget-settings/budget-settings.component').then((m) => m.BudgetSettingsComponent) },
      { path: 'contracts-budget/budget-preparation', loadComponent: () => import('./features/contracts-budget/budget-preparation/budget-preparation.component').then((m) => m.BudgetPreparationComponent) },
      { path: 'contracts-budget/budget-breakdown', loadComponent: () => import('./features/contracts-budget/budget-breakdown/budget-breakdown.component').then((m) => m.BudgetBreakdownComponent) },
      { path: 'contracts-budget/accrual-forecast', loadComponent: () => import('./features/contracts-budget/accrual-forecast/accrual-forecast.component').then((m) => m.AccrualForecastComponent) },
      { path: 'contracts-budget/team-forecast', loadComponent: () => import('./features/contracts-budget/team-forecast/team-forecast.component').then((m) => m.TeamForecastComponent) },
      { path: 'contracts-budget/forecast-settings', loadComponent: () => import('./features/contracts-budget/forecast-settings/forecast-settings.component').then((m) => m.ForecastSettingsComponent) },
      { path: 'contracts-budget/forecast', loadComponent: () => import('./features/contracts-budget/cost-forecast/cost-forecast.component').then((m) => m.CostForecastComponent) },

      // CSR Management
      { path: 'csr/directory', loadComponent: () => import('./features/csr/agent-directory/agent-directory.component').then((m) => m.AgentDirectoryComponent) },
      { path: 'csr/directory/:id', loadComponent: () => import('./features/csr/agent-profile/agent-profile.component').then((m) => m.AgentProfileComponent) },
      { path: 'csr/leave', loadComponent: () => import('./features/csr/leave-management/leave-management.component').then((m) => m.LeaveManagementComponent) },
      { path: 'csr/analytics', loadComponent: () => import('./features/csr/workforce-analytics/workforce-analytics.component').then((m) => m.WorkforceAnalyticsComponent) },
      { path: 'csr/recruitment', loadComponent: () => import('./features/csr/recruitment/recruitment.component').then((m) => m.RecruitmentComponent) },
      { path: 'csr/performance', loadComponent: () => import('./features/csr/performance-monitoring/performance-monitoring.component').then((m) => m.PerformanceMonitoringComponent) },

      // Internal Project Movement
      { path: 'movement/announcements', loadComponent: () => import('./features/movement/announcements/announcements.component').then((m) => m.AnnouncementsComponent) },
      { path: 'movement/apply', loadComponent: () => import('./features/movement/apply/apply.component').then((m) => m.ApplyComponent) },
      { path: 'movement/review', loadComponent: () => import('./features/movement/review/review.component').then((m) => m.ReviewComponent) },
      { path: 'movement/dashboard', loadComponent: () => import('./features/movement/dashboard/movement-dashboard.component').then((m) => m.MovementDashboardComponent) },

      // Invoicing & Payments
      { path: 'invoicing/reconciliation', loadComponent: () => import('./features/invoicing/reconciliation/reconciliation.component').then((m) => m.ReconciliationComponent) },
      { path: 'invoicing/rules', loadComponent: () => import('./features/invoicing/rules/rules.component').then((m) => m.RulesComponent) },
      { path: 'invoicing/tracking', loadComponent: () => import('./features/invoicing/tracking/tracking.component').then((m) => m.TrackingComponent) },
      { path: 'invoicing/dashboard', loadComponent: () => import('./features/invoicing/dashboard/payment-dashboard.component').then((m) => m.PaymentDashboardComponent) },

      // Administration
      { path: 'admin/access-control', loadComponent: () => import('./features/admin/access-control/access-control.component').then((m) => m.AccessControlComponent) },
      { path: 'admin/audit-log', loadComponent: () => import('./features/admin/audit-log/audit-log.component').then((m) => m.AuditLogComponent) },

      { path: '**', redirectTo: 'contracts-budget/dashboard' },
    ],
  },
];
