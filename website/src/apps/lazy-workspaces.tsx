import {Component,lazy,Suspense,type ComponentType,type ReactNode} from 'react';

class WorkspaceLoadBoundary extends Component<{children:ReactNode;scope:string},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidUpdate(previous:Readonly<{children:ReactNode;scope:string}>){if(previous.scope!==this.props.scope&&this.state.failed)this.setState({failed:false});}
  render(){return this.state.failed?<section className="panel workspace-loading" role="alert"><h2>We couldn't open this app</h2><p>Reload the workspace to try again.</p><button className="secondary-button" onClick={()=>location.reload()}>Reload workspace</button></section>:this.props.children;}
}

function workspace<P extends object>(load:()=>Promise<{default:ComponentType<P>}>) {
  const Screen=lazy(load);
  return function Workspace(props:P){return <WorkspaceLoadBoundary scope={'scope' in props?String(props.scope):''}><Suspense fallback={<section className="panel workspace-loading" role="status"><span className="workspace-loading-mark" aria-hidden="true"/><strong>Opening workspace…</strong><p>Your authorized records will appear here.</p></section>}><Screen {...props}/></Suspense></WorkspaceLoadBoundary>;};
}
export const CommerceWorkspace=workspace<Parameters<typeof import('../commerce/CommerceWorkspace')['CommerceWorkspace']>[0]>(()=>import('../commerce/CommerceWorkspace').then(m=>({default:m.CommerceWorkspace})));
export const CommerceMerchantWorkspace=workspace<Parameters<typeof import('../commerce/CommerceMerchantWorkspace')['CommerceMerchantWorkspace']>[0]>(()=>import('../commerce/CommerceMerchantWorkspace').then(m=>({default:m.CommerceMerchantWorkspace})));
export const POSWorkspace=workspace<Parameters<typeof import('../pos/POSWorkspace')['POSWorkspace']>[0]>(()=>import('../pos/POSWorkspace').then(m=>({default:m.POSWorkspace})));
export const ProcurementWorkspace=workspace<Parameters<typeof import('./ProcurementWorkspace')['ProcurementWorkspace']>[0]>(()=>import('./ProcurementWorkspace').then(m=>({default:m.ProcurementWorkspace})));
export const DocumentsWorkspace=workspace<Parameters<typeof import('./DocumentsWorkspace')['DocumentsWorkspace']>[0]>(()=>import('./DocumentsWorkspace').then(m=>({default:m.DocumentsWorkspace})));
export const PeopleWorkspace=workspace<Parameters<typeof import('./PeopleWorkspace')['PeopleWorkspace']>[0]>(()=>import('./PeopleWorkspace').then(m=>({default:m.PeopleWorkspace})));
export const WorkWorkspace=workspace<Parameters<typeof import('./WorkWorkspace')['WorkWorkspace']>[0]>(()=>import('./WorkWorkspace').then(m=>({default:m.WorkWorkspace})));
export const AccountingWorkspace=workspace<Parameters<typeof import('./AccountingWorkspace')['AccountingWorkspace']>[0]>(()=>import('./AccountingWorkspace').then(m=>({default:m.AccountingWorkspace})));
export const BusinessIDWorkspace=workspace<Parameters<typeof import('./BusinessIDWorkspace')['BusinessIDWorkspace']>[0]>(()=>import('./BusinessIDWorkspace').then(m=>({default:m.BusinessIDWorkspace})));
export const AutomationsWorkspace=workspace<Parameters<typeof import('./AutomationsWorkspace')['AutomationsWorkspace']>[0]>(()=>import('./AutomationsWorkspace').then(m=>({default:m.AutomationsWorkspace})));
export const SalesWorkspace=workspace<Parameters<typeof import('./SalesWorkspace')['SalesWorkspace']>[0]>(()=>import('./SalesWorkspace').then(m=>({default:m.SalesWorkspace})));
export const AnalyticsWorkspace=workspace<Parameters<typeof import('./AnalyticsWorkspace')['AnalyticsWorkspace']>[0]>(()=>import('./AnalyticsWorkspace').then(m=>({default:m.AnalyticsWorkspace})));
export const CrmWorkspace=workspace<Parameters<typeof import('./CrmWorkspace')['CrmWorkspace']>[0]>(()=>import('./CrmWorkspace').then(m=>({default:m.CrmWorkspace})));
export const InventoryWorkspace=workspace<Parameters<typeof import('./InventoryWorkspace')['InventoryWorkspace']>[0]>(()=>import('./InventoryWorkspace').then(m=>({default:m.InventoryWorkspace})));
export const FinanceDashboard=workspace<Parameters<typeof import('./FinanceDashboard')['FinanceDashboard']>[0]>(()=>import('./FinanceDashboard').then(m=>({default:m.FinanceDashboard})));
