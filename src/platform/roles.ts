export const roles = [
  'owner',
  'admin',
  'finance',
  'accountant',
  'hr',
  'sales',
  'operations',
  'inventory_manager',
  'support_agent',
  'marketing_manager',
  'viewer',
] as const;

export const invitableRoles = [
  'admin',
  'finance',
  'accountant',
  'hr',
  'sales',
  'operations',
  'inventory_manager',
  'support_agent',
  'marketing_manager',
  'viewer',
] as const;

export const roleAppAccess: Record<string, readonly string[] | '*'> = {
  owner: '*',
  admin: '*',
  finance: [
    'finance',
    'accounting',
    'sales',
    'analytics',
    'procurement',
    'subscriptions',
    'property_hospitality',
    'documents',
    'calendar',
    'work',
  ],
  accountant: [
    'accounting',
    'finance',
    'sales',
    'analytics',
    'subscriptions',
    'documents',
    'calendar',
    'work',
  ],
  hr: ['people', 'knowledge_learning', 'work', 'calendar', 'documents'],
  sales: ['crm', 'sales', 'pos', 'commerce', 'subscriptions', 'calendar', 'work', 'documents'],
  operations: [
    'inventory',
    'procurement',
    'pos',
    'sales',
    'crm',
    'work',
    'calendar',
    'documents',
    'manufacturing',
    'field_operations',
    'logistics',
    'property_hospitality',
    'knowledge_learning',
    'support',
  ],
  inventory_manager: [
    'inventory',
    'procurement',
    'manufacturing',
    'logistics',
    'field_operations',
    'pos',
    'work',
    'calendar',
    'documents',
  ],
  support_agent: [
    'support',
    'crm',
    'knowledge_learning',
    'field_operations',
    'work',
    'calendar',
    'documents',
  ],
  marketing_manager: [
    'marketing',
    'website',
    'commerce',
    'crm',
    'analytics',
    'calendar',
    'work',
    'documents',
  ],
  viewer: ['analytics', 'finance', 'work', 'calendar', 'documents', 'knowledge_learning'],
};

export function roleAllowsApp(role: string | undefined, appId: string, kind = 'business'): boolean {
  if (kind !== 'business') return true;
  if (!role || role === 'owner' || role === 'admin') return true;
  const allowed = roleAppAccess[role];
  if (!allowed) return false;
  if (allowed === '*') return true;
  return allowed.includes(appId);
}
