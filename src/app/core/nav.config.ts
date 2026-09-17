export interface NavItem {
  label: string;
  path: string;
  icon: string;
}

export interface NavGroup {
  label: string;
  icon: string;
  basePath: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Contracts & Budget',
    icon: 'description',
    basePath: '/contracts-budget',
    items: [
      { label: 'Contract Dashboard', path: 'dashboard', icon: 'dashboard' },
      { label: 'Contract List', path: 'contracts', icon: 'list_alt' },
      { label: 'Sync History', path: 'sync-history', icon: 'sync' },
      { label: 'Notification Config', path: 'notifications', icon: 'notifications' },
      { label: 'Contract Reports', path: 'reports', icon: 'summarize' },
      { label: 'Budget Dashboard', path: 'budget-dashboard', icon: 'account_balance_wallet' },
      { label: 'Budget Preparation', path: 'budget-preparation', icon: 'edit_note' },
      { label: 'Budget Breakdown', path: 'budget-breakdown', icon: 'pie_chart' },
      { label: 'Cost & Petty Cash Forecast', path: 'forecast', icon: 'trending_up' },
    ],
  },
  {
    label: 'CSR Management',
    icon: 'groups',
    basePath: '/csr',
    items: [
      { label: 'Team & Agent Directory', path: 'directory', icon: 'badge' },
      { label: 'Leave Management', path: 'leave', icon: 'event_available' },
      { label: 'Workforce Analytics', path: 'analytics', icon: 'insights' },
      { label: 'Recruitment & Interview', path: 'recruitment', icon: 'person_search' },
      { label: 'Performance Monitoring', path: 'performance', icon: 'speed' },
    ],
  },
  {
    label: 'Internal Project Movement',
    icon: 'swap_horiz',
    basePath: '/movement',
    items: [
      { label: 'Announcements', path: 'announcements', icon: 'campaign' },
      { label: 'Apply for Movement', path: 'apply', icon: 'assignment_ind' },
      { label: 'Request Review', path: 'review', icon: 'fact_check' },
      { label: 'Movement Dashboard', path: 'dashboard', icon: 'dashboard' },
    ],
  },
  {
    label: 'Invoicing & Payments',
    icon: 'receipt_long',
    basePath: '/invoicing',
    items: [
      { label: 'Reconciliation Workspace', path: 'reconciliation', icon: 'calculate' },
      { label: 'Payable Rule Config', path: 'rules', icon: 'tune' },
      { label: 'PO & Payment Tracking', path: 'tracking', icon: 'view_kanban' },
      { label: 'Payment Dashboard', path: 'dashboard', icon: 'dashboard' },
    ],
  },
  {
    label: 'Administration',
    icon: 'admin_panel_settings',
    basePath: '/admin',
    items: [
      { label: 'Access Control', path: 'access-control', icon: 'lock_person' },
      { label: 'Audit Log', path: 'audit-log', icon: 'history' },
    ],
  },
];
