import {useEffect,useState} from 'react';
import {Icon} from '../components/Icon';
import type {API} from '../operations/UI';
export function NotificationBell({api,scope,navigate}:{kind?:string;api:API;scope:string;navigate:(tab:string)=>void;openRecord?:(tab:string,id:string)=>void}){
 const [unread,setUnread]=useState(0);
 useEffect(()=>{let current=true,running=false;setUnread(0);async function load(){if(running||document.visibilityState==='hidden')return;running=true;try{const r=await api('/notifications/summary');if(current)setUnread(r.unread);}catch{/* The full page exposes fetch errors and retry. */}finally{running=false;}}void load();const timer=setInterval(load,30000);document.addEventListener('visibilitychange',load);return()=>{current=false;clearInterval(timer);document.removeEventListener('visibilitychange',load);};},[scope]);
 return <button className="icon-button notification-bell" aria-label={'Notifications'+(unread?', '+unread+' unread':'')} onClick={()=>navigate('Notifications')}><Icon name="bell"/>{unread>0&&<span className="notification-count">{unread>99?'99+':unread}</span>}</button>;
}
