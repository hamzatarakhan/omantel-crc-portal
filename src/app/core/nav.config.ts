export interface NavItem {
  label: string;
  path: string;
  icon: string;
  /** Visible when the current role has ANY of these permissions. Omit = everyone. */
  perms?: string[];
}

export interface NavGroup {
  label: string;
  icon: string;
  basePath: string;
  items: NavItem[];
  adminOnly?: boolean;
}

const VIEW_CONTRACTS = ['View Contracts'];
const VIEW_AGENTS = ['View Agent Profiles'];
const MOVEMENT_ANY = ['Create Movement Announcement', 'Review/Approve Movement Requests'];

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Contracts & Budget',
    icon: 'description',
    basePath: '/contracts-budget',
    items: [
      { label: 'Contract Dashboard', path: 'dashboard', icon: 'dashboard', perms: VIEW_CONTRACTS },
      { label: 'Contract List', path: 'contracts', icon: 'list_alt', perms: VIEW_CONTRACTS },
      { label: 'Sync History', path: 'sync-history', icon: 'sync', perms: VIEW_CONTRACTS },
      { label: 'Notification Config', path: 'notifications', icon: 'notifications', perms: VIEW_CONTRACTS },
      { label: 'Contract Reports', path: 'reports', icon: 'summarize', perms: VIEW_CONTRACTS },
      { label: 'Budget Dashboard', path: 'budget-dashboard', icon: 'account_balance_wallet', perms: VIEW_CONTRACTS },
      { label: 'Budget Preparation', path: 'budget-preparation', icon: 'edit_note', perms: ['Prepare/Edit Draft Budget', 'Approve Budget'] },
      { label: 'Budget Breakdown', path: 'budget-breakdown', icon: 'pie_chart', perms: VIEW_CONTRACTS },
      { label: 'Cost & Petty Cash Forecast', path: 'forecast', icon: 'trending_up', perms: VIEW_CONTRACTS },
    ],
  },
  {
    label: 'CSR Management',
    icon: 'groups',
    basePath: '/csr',
    items: [
      { label: 'Team & Agent Directory', path: 'directory', icon: 'badge', perms: VIEW_AGENTS },
      { label: 'Leave Management', path: 'leave', icon: 'event_available', perms: VIEW_AGENTS },
      { label: 'Workforce Analytics', path: 'analytics', icon: 'insights', perms: VIEW_AGENTS },
      { label: 'Recruitment & Interview', path: 'recruitment', icon: 'person_search', perms: ['Manage Recruitment'] },
      { label: 'Performance Monitoring', path: 'performance', icon: 'speed', perms: VIEW_AGENTS },
    ],
  },
  {
    label: 'Internal Project Movement',
    icon: 'swap_horiz',
    basePath: '/movement',
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
      { label: 'Payment Dashboard', path: 'dashboard', icon: 'dashboard', perms: ['Validate Invoice', 'Configure Payable Rules'] },
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
