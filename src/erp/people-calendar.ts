import {fail} from '../platform/auth';
export const peopleDay=(at=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Nairobi',year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
export function leaveUnits(policy:{working_week:number[];holidays:{date:string}[]},from:string,to:string,half=false){
 const first=Date.parse(from+'T00:00:00Z'),last=Date.parse(to+'T00:00:00Z');if(last<first||(last-first)/86400000>365)fail(400,'Use an ordered leave range of at most one year');if(from.slice(0,4)!==to.slice(0,4))fail(400,'Submit separate requests for different leave-policy years');if(half&&from!==to)fail(400,'Half-day leave uses one calendar date');const holidays=new Set(policy.holidays.map(h=>h.date));let days=0;for(let value=first;value<=last;value+=86400000){const date=new Date(value);if(policy.working_week.includes(date.getUTCDay())&&!holidays.has(date.toISOString().slice(0,10)))days++;}if(!days)fail(400,'The range contains no configured working days');return days*(half?500:1000);
}
/** Employer-configured policy only: no statutory entitlement is implied. */
export function earnedLeave(type:{annual_allowance_milli:number;accrual:string;prorate_start_year:boolean},start:string,year:number,at=peopleDay()){
 const currentYear=Number(at.slice(0,4)),startYear=Number(start.slice(0,4)),startMonth=Number(start.slice(5,7))-1,startDay=Number(start.slice(8,10));if(year>currentYear||year<startYear||at<start)return 0;
 if(type.accrual==='annual')return year===startYear&&type.prorate_start_year?Math.floor(type.annual_allowance_milli*(12-startMonth)/12):type.annual_allowance_milli;
 const completed=year<currentYear?12:Number(at.slice(5,7))-1,eligibleStart=year===startYear?startMonth+(startDay>1?1:0):0,months=Math.max(0,completed-eligibleStart);return Math.floor(type.annual_allowance_milli*months/12);
}
