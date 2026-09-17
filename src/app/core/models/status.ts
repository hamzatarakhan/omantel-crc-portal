export type StatusLevel = 'normal' | 'amber' | 'orange' | 'red' | 'info' | 'neutral';

export interface StatusMeta {
  label: string;
  level: StatusLevel;
}

/** Shared expiry-style status coloring (Section 9.1 of the requirements doc) reused for contracts, budgets, movements, performance. */
export function daysRemainingToLevel(daysRemaining: number): StatusLevel {
  if (daysRemaining < 0) return 'red';
  if (daysRemaining <= 5) return 'red';
  if (daysRemaining <= 15) return 'orange';
  if (daysRemaining <= 30) return 'amber';
  return 'normal';
}

export function percentUsedToLevel(percentUsed: number): StatusLevel {
  if (percentUsed >= 100) return 'red';
  if (percentUsed >= 90) return 'orange';
  if (percentUsed >= 75) return 'amber';
  return 'normal';
}
