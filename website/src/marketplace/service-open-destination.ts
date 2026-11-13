export type ServiceOpenDestination = { tab: string; app?: string; section?: string };

const businessIdSections: Record<string, string> = {
  verification: 'verification',
  credentials: 'credentials',
  trust_network: 'relationships',
  blockchain: 'credentials',
};

/** Route trust services into the matching Business ID app section instead of
 * silently falling back to the generic Passport overview. */
export function serviceOpenDestination(service: { id: string; tabs?: readonly string[] }): ServiceOpenDestination {
  const section = businessIdSections[service.id];
  if (section) return { tab: 'Apps', app: 'business_id', section };
  return { tab: service.tabs?.[0] || 'Business Passport' };
}
