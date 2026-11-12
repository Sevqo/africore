/** Exact half-open UTC interval for one register-local calendar date, including
 * daylight-saving transitions. A skipped local date has no report interval. */
export function registerDayWindow(day:string,timeZone:string){
 const center=Date.parse(day+'T00:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(center)||new Date(center).toISOString().slice(0,10)!==day)throw new Error('Invalid register report date');
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});
 const next=new Date(center+86400000).toISOString().slice(0,10);
 const lower=(target:string)=>{let lo=center-3*86400000,hi=center+3*86400000;while(lo<hi){const mid=Math.floor((lo+hi)/2);if(formatter.format(mid)<target)lo=mid+1;else hi=mid;}return lo;};
 const from=lower(day),to=lower(next);
 if(from===to||formatter.format(from)!==day)throw new Error('This calendar date does not exist in the register time zone');
 return {from:new Date(from).toISOString(),to:new Date(to).toISOString()};
}
