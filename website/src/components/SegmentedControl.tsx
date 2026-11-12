import {useId} from 'react';

/** Native buttons retain Tab/Enter behavior; arrow keys move and select a segment. */
export function SegmentedControl<T extends string | number>({label,value,options,onChange}:{label:string;value:T;options:readonly {value:T;label:string}[];onChange:(value:T)=>void}) {
  const id=useId();
  return <div className="segmented-control" role="group" aria-label={label}>
    {options.map((option,index)=><button type="button" key={option.value} id={`${id}-${index}`} aria-pressed={value===option.value} onClick={()=>onChange(option.value)} onKeyDown={event=>{
      const direction=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0;
      if(!direction&&event.key!=='Home'&&event.key!=='End')return;
      event.preventDefault();
      const next=event.key==='Home'?0:event.key==='End'?options.length-1:(index+direction+options.length)%options.length;
      onChange(options[next].value);
      document.getElementById(`${id}-${next}`)?.focus();
    }}>{option.label}</button>)}
  </div>;
}
