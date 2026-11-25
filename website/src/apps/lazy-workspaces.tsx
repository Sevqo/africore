import { Component, lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { WorkspaceSkeleton } from '../components/Skeleton';

class WorkspaceLoadBoundary extends Component<
  { children: ReactNode; scope: string },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(previous: Readonly<{ children: ReactNode; scope: string }>) {
    if (previous.scope !== this.props.scope && this.state.failed) this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? (
      <section className="panel workspace-loading" role="alert">
        <h2>We couldn't open this app</h2>
        <p>Reload the workspace to try again.</p>
        <button className="secondary-button" onClick={() => location.reload()}>
          Reload workspace
        </button>
      </section>
    ) : (
      this.props.children
    );
  }
}

function workspace<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  const Screen = lazy(load);
  return function Workspace(props: P) {
    return (
      <WorkspaceLoadBoundary scope={'scope' in props ? String(props.scope) : ''}>
        <Suspense fallback={<WorkspaceSkeleton label="Opening workspace…" />}>
          <Screen {...props} />
        </Suspense>
      </WorkspaceLoadBoundary>
    );
  };
}
export const CommerceWorkspace = workspace<
  Parameters<(typeof import('../commerce/CommerceWorkspace'))['CommerceWorkspace']>[0]
>(() => import('../commerce/CommerceWorkspace').then((m) => ({ default: m.CommerceWorkspace })));
export const CommerceMerchantWorkspace = workspace<
  Parameters<
    (typeof import('../commerce/CommerceMerchantWorkspace'))['CommerceMerchantWorkspace']
  >[0]
>(() =>
  import('../commerce/CommerceMerchantWorkspace').then((m) => ({
    default: m.CommerceMerchantWorkspace,
  })),
);
export const POSWorkspace = workspace<
  Parameters<(typeof import('../pos/POSWorkspace'))['POSWorkspace']>[0]
>(() => import('../pos/POSWorkspace').then((m) => ({ default: m.POSWorkspace })));
export const POSAppWorkspace = workspace<
  Parameters<(typeof import('../pos/POSAppWorkspace'))['POSAppWorkspace']>[0]
>(() => import('../pos/POSAppWorkspace').then((m) => ({ default: m.POSAppWorkspace })));
export const ProcurementWorkspace = workspace<
  Parameters<(typeof import('./ProcurementWorkspace'))['ProcurementWorkspace']>[0]
>(() => import('./ProcurementWorkspace').then((m) => ({ default: m.ProcurementWorkspace })));
export const ProcurementAppWorkspace = workspace<
  Parameters<(typeof import('./ProcurementAppWorkspace'))['ProcurementAppWorkspace']>[0]
>(() => import('./ProcurementAppWorkspace').then((m) => ({ default: m.ProcurementAppWorkspace })));
export const DocumentsWorkspace = workspace<
  Parameters<(typeof import('./DocumentsWorkspace'))['DocumentsWorkspace']>[0]
>(() => import('./DocumentsWorkspace').then((m) => ({ default: m.DocumentsWorkspace })));
export const PeopleWorkspace = workspace<
  Parameters<(typeof import('./PeopleWorkspace'))['PeopleWorkspace']>[0]
>(() => import('./PeopleWorkspace').then((m) => ({ default: m.PeopleWorkspace })));
export const WorkWorkspace = workspace<
  Parameters<(typeof import('./WorkWorkspace'))['WorkWorkspace']>[0]
>(() => import('./WorkWorkspace').then((m) => ({ default: m.WorkWorkspace })));
export const AccountingWorkspace = workspace<
  Parameters<(typeof import('./AccountingWorkspace'))['AccountingWorkspace']>[0]
>(() => import('./AccountingWorkspace').then((m) => ({ default: m.AccountingWorkspace })));
export const AccountingAppWorkspace = workspace<
  Parameters<(typeof import('./AccountingAppWorkspace'))['AccountingAppWorkspace']>[0]
>(() => import('./AccountingAppWorkspace').then((m) => ({ default: m.AccountingAppWorkspace })));
export const BusinessIDWorkspace = workspace<
  Parameters<(typeof import('./BusinessIDWorkspace'))['BusinessIDWorkspace']>[0]
>(() => import('./BusinessIDWorkspace').then((m) => ({ default: m.BusinessIDWorkspace })));
export const AutomationsWorkspace = workspace<
  Parameters<(typeof import('./AutomationsWorkspace'))['AutomationsWorkspace']>[0]
>(() => import('./AutomationsWorkspace').then((m) => ({ default: m.AutomationsWorkspace })));
export const CalendarWorkspace = workspace<
  Parameters<(typeof import('./CalendarWorkspace'))['CalendarWorkspace']>[0]
>(() => import('./CalendarWorkspace').then((m) => ({ default: m.CalendarWorkspace })));
export const WebsiteWorkspace = workspace<
  Parameters<(typeof import('./WebsiteWorkspace'))['WebsiteWorkspace']>[0]
>(() => import('./WebsiteWorkspace').then((m) => ({ default: m.WebsiteWorkspace })));
export const SalesWorkspace = workspace<
  Parameters<(typeof import('./SalesWorkspace'))['SalesWorkspace']>[0]
>(() => import('./SalesWorkspace').then((m) => ({ default: m.SalesWorkspace })));
export const SalesAppWorkspace = workspace<
  Parameters<(typeof import('./SalesAppWorkspace'))['SalesAppWorkspace']>[0]
>(() => import('./SalesAppWorkspace').then((m) => ({ default: m.SalesAppWorkspace })));
export const AnalyticsWorkspace = workspace<
  Parameters<(typeof import('./AnalyticsWorkspace'))['AnalyticsWorkspace']>[0]
>(() => import('./AnalyticsWorkspace').then((m) => ({ default: m.AnalyticsWorkspace })));
export const CrmWorkspace = workspace<
  Parameters<(typeof import('./CrmWorkspace'))['CrmWorkspace']>[0]
>(() => import('./CrmWorkspace').then((m) => ({ default: m.CrmWorkspace })));
export const InventoryWorkspace = workspace<
  Parameters<(typeof import('./InventoryWorkspace'))['InventoryWorkspace']>[0]
>(() => import('./InventoryWorkspace').then((m) => ({ default: m.InventoryWorkspace })));
export const InventoryAppWorkspace = workspace<
  Parameters<(typeof import('./InventoryAppWorkspace'))['InventoryAppWorkspace']>[0]
>(() => import('./InventoryAppWorkspace').then((m) => ({ default: m.InventoryAppWorkspace })));
export const FinanceDashboard = workspace<
  Parameters<(typeof import('./FinanceDashboard'))['FinanceDashboard']>[0]
>(() => import('./FinanceDashboard').then((m) => ({ default: m.FinanceDashboard })));
export const FinanceAppWorkspace = workspace<
  Parameters<(typeof import('./FinanceAppWorkspace'))['FinanceAppWorkspace']>[0]
>(() => import('./FinanceAppWorkspace').then((m) => ({ default: m.FinanceAppWorkspace })));
export const OdooSuiteExpansionWorkspace = workspace<
  Parameters<(typeof import('./OdooSuiteExpansionWorkspace'))['OdooSuiteExpansionWorkspace']>[0]
>(() =>
  import('./OdooSuiteExpansionWorkspace').then((m) => ({
    default: m.OdooSuiteExpansionWorkspace,
  })),
);
export const ExtendedAppWorkspace = workspace<
  Parameters<(typeof import('./ExtendedAppWorkspace'))['ExtendedAppWorkspace']>[0]
>(() =>
  import('./ExtendedAppWorkspace').then((m) => ({
    default: m.ExtendedAppWorkspace,
  })),
);
