import { PassportWorkspace } from '../trust/PassportWorkspace';
import './business-id.css';
const sections: Record<string, string> = {
  dashboard: 'Overview',
  profile: 'Business Profile',
  verification: 'Verification',
  passport: 'Business Passport',
  credentials: 'Credentials',
  evidence: 'Evidence',
  sharing: 'Shared Access',
  relationships: 'Relationships',
  history: 'History',
  settings: 'Settings',
};
/** An app over the existing holder, evidence, credential and consent services. */
export function BusinessIDWorkspace({
  scope,
  role,
  services,
  section = 'dashboard',
}: {
  scope: string;
  role: string;
  services: any[];
  section?: string;
}) {
  const [org, environment] = scope.split('\0');
  return (
    <div className="apps-workspace business-id-workspace">
      <PassportWorkspace
        holderOnly
        key={scope}
        org={org}
        environment={environment}
        role={role}
        serviceIds={services.filter((s) => s.status === 'active').map((s) => s.id)}
        initialTab={sections[section] || 'Overview'}
      />
    </div>
  );
}
