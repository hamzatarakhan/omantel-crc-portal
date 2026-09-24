export interface NavItem {
  label: string;
  path: string;
  icon: string;
  /** Visible when the current role has ANY of these permissions. Omit = everyone. */
  perms?: string[];
  /** Items that share a section are shown together under a collapsible sub-menu. */
  section?: string;
  /** Not in the SRS: kept in the code but removed from the menu and from direct links. */
  hidden?: boolean;
}

export interface NavGroup {
  label: string;
  icon: string;
  basePath: string;
  items: NavItem[];
  adminOnly?: boolean;
  /** Icon for each sub-menu label used by `section`. */
  sections?: Record<string, string>;
  /** Not in the SRS: kept in the code but removed from the menu and from direct links. */
  hidden?: boolean;
}

/** Permission modules that belong to hidden screens (also hidden from the access matrix). */
export const HIDDEN_MODULES = ['Internal Project Movement'];

const VIEW_CONTRACTS = ['View Contracts'];
const VIEW_AGENTS = ['View Agent Profiles'];
/** Performance and overtime rules decide what agents are paid, so only roles that may see salaries can open them. */
const PAYROLL_SETTINGS = ['View Employee Salary'];
const MOVEMENT_ANY = ['Create Movement Announcement', 'Review/Approve Movement Requests'];

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Contracts & Budget',
    icon: 'description',
    basePath: '/contracts-budget',
    sections: { Monitoring: 'fact_check', Synchronization: 'sync', Budget: 'account_balance_wallet', Forecast: 'query_stats' },
    items: [
      { label: 'Contract Dashboard', path: 'dashboard', icon: 'dashboard', perms: ['View Dashboards'] },
      { label: 'Contract Trends', path: 'trends', icon: 'show_chart', perms: ['View Dashboards'] },
      { label: 'Contract List', path: 'contracts', icon: 'list_alt', perms: VIEW_CONTRACTS },
      { label: 'Contract Reports', path: 'reports', icon: 'summarize', perms: VIEW_CONTRACTS },
      { label: 'Needs Attention', path: 'needs-attention', icon: 'assignment_late', perms: ['View Dashboards'], section: 'Monitoring' },
      { label: 'Monitoring Actions', path: 'actions', icon: 'assignment_turned_in', perms: ['Manage Monitoring Actions'], section: 'Monitoring' },
      { label: 'Alerts & Escalation', path: 'notifications', icon: 'notifications', perms: ['Manage Notifications', 'Manage Escalations'], section: 'Monitoring' },
      { label: 'Sync Overview', path: 'sync', icon: 'monitor_heart', perms: ['View Sync History'], section: 'Synchronization', hidden: true },
      { label: 'Run History', path: 'sync-history', icon: 'history', perms: ['View Sync History'], section: 'Synchronization' },
      { label: 'Error Log', path: 'sync-errors', icon: 'error_outline', perms: ['View Sync History'], section: 'Synchronization' },
      { label: 'Configuration', path: 'sync-config', icon: 'schedule', perms: ['Manage Sync Configuration'], section: 'Synchronization' },
      { label: 'Audit History', path: 'audit-history', icon: 'manage_search', perms: ['View Audit History'] },
      { label: 'Budget Dashboard', path: 'budget-dashboard', icon: 'dashboard', perms: ['View Budget'], section: 'Budget', hidden: true },
      { label: 'Budget Preparation', path: 'budget-preparation', icon: 'edit_note', perms: ['Prepare/Edit Draft Budget', 'Manage Budget Cycle', 'View Budget'], section: 'Budget' },
      { label: 'Budget Breakdown', path: 'budget-breakdown', icon: 'pie_chart', perms: ['View Budget'], section: 'Budget', hidden: true },
      { label: 'Cost & Petty Cash', path: 'forecast', icon: 'trending_up', perms: ['View Budget'], section: 'Budget' },
      { label: 'Budget Settings', path: 'budget-settings', icon: 'settings', perms: ['Manage Budget Cycle'], section: 'Budget' },
      { label: 'Project Requests', path: 'projects', icon: 'rocket_launch', perms: ['Submit Project Requests', 'Approve Projects', 'View Budget'], section: 'Budget' },
      { label: 'Accrual Forecast', path: 'accrual-forecast', icon: 'receipt_long', perms: ['View Accrual Forecast'], section: 'Forecast' },
      { label: 'Team Forecast', path: 'team-forecast', icon: 'groups', perms: ['View Team Forecast'], section: 'Forecast' },
      { label: 'Transaction Forecast', path: 'transaction-forecast', icon: 'support_agent', perms: ['View Transaction Forecast'], section: 'Forecast' },
      { label: 'Forecast Settings', path: 'forecast-settings', icon: 'tune', perms: ['Configure Forecast'], section: 'Forecast' },
    ],
  },
  {
    label: 'CSR Management',
    icon: 'groups',
    basePath: '/csr',
    sections: { 'Payroll Settings': 'tune' },
    items: [
      { label: 'Team & Agent Directory', path: 'directory', icon: 'badge', perms: VIEW_AGENTS },
      { label: 'Leave Management', path: 'leave', icon: 'event_available', perms: VIEW_AGENTS },
      { label: 'Workforce Analytics', path: 'analytics', icon: 'insights', perms: VIEW_AGENTS },
      { label: 'Recruitment & Interview', path: 'recruitment', icon: 'person_search', perms: ['Manage Recruitment'] },
      { label: 'Performance Monitoring', path: 'performance', icon: 'speed', perms: VIEW_AGENTS },
      { label: 'Performance & Overtime', path: 'performance-overtime', icon: 'query_stats', perms: VIEW_AGENTS },
      { label: 'Performance Settings', path: 'performance-settings', icon: 'workspace_premium', perms: PAYROLL_SETTINGS, section: 'Payroll Settings' },
      { label: 'Overtime Settings', path: 'overtime-settings', icon: 'more_time', perms: PAYROLL_SETTINGS, section: 'Payroll Settings' },
    ],
  },
  {
    label: 'Internal Project Movement',
    icon: 'swap_horiz',
    basePath: '/movement',
    hidden: true,
    items: [
      { label: 'Announcements', path: 'announcements', icon: 'campaign', perms: ['Create Movement Announcement'] },
      { label: 'Apply for Movement', path: 'apply', icon: 'assignment_ind', perms: MOVEMENT_ANY },
      { label: 'Request Review', path: 'review', icon: 'fact_check', perms: ['Review/Approve Movement Requests'] },
      { label: 'Movement Dashboard', path: 'dashboard', icon: 'dashboard', perms: MOVEMENT_ANY },
    ],
  },
  {
    label: 'Invoicing & Payments',
    icon: 'receipt_long',
    basePath: '/invoicing',
    items: [
      { label: 'Reconciliation Workspace', path: 'reconciliation', icon: 'calculate', perms: ['Validate Invoice'] },
      { label: 'Payable Rule Config', path: 'rules', icon: 'tune', perms: ['Configure Payable Rules'] },
      { label: 'PO & Payment Tracking', path: 'tracking', icon: 'view_kanban', perms: ['Validate Invoice'] },
      { label: 'Payment Dashboard', path: 'dashboard', icon: 'dashboard', perms: ['Validate Invoice', 'Configure Payable Rules'], hidden: true },
    ],
  },
  {
    label: 'Administration',
    icon: 'admin_panel_settings',
    basePath: '/admin',
    adminOnly: true,
    items: [
      { label: 'Access Control', path: 'access-control', icon: 'lock_person' },
      { label: 'Audit Log', path: 'audit-log', icon: 'history' },
    ],
  },
];
