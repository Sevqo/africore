export const notificationFilters=['All','Unread','Approvals','Orders','Finance','System'] as const;
export type NotificationFilter=typeof notificationFilters[number];
export function matchesNotification(n:any,filter:NotificationFilter,query:string){
 const category=String(n.category||'');
 const match=filter==='All'||filter==='Unread'&&!n.read_at||filter==='Approvals'&&n.severity==='approval_required'||filter==='Orders'&&['orders','deliveries','sales'].includes(category)||filter==='Finance'&&['payments','invoices','cash_flow','reconciliation','protected_payments'].includes(category)||filter==='System'&&['security','team','integrations','automation_failures'].includes(category);
 return match&&[n.title,n.body,category].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}
export function notificationDateGroup(created:string,now=new Date()){
 const date=(d:Date)=>d.toLocaleDateString('en-CA',{timeZone:'Africa/Nairobi'});
 const yesterday=new Date(now.getTime()-86400000);
 return date(new Date(created))===date(now)?'Today':date(new Date(created))===date(yesterday)?'Yesterday':'Earlier';
}
