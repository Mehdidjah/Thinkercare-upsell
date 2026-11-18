import {useEffect,useState} from 'react';
import {MAX_ITEM_QUANTITY} from '@touche/domain';

export default function QuantityControl({label,value,min=1,disabled=false,onChange}:{
  label:string;value:number;min?:number;disabled?:boolean;onChange:(value:number)=>boolean|void;
}) {
  const [draft,setDraft]=useState(String(value));
  useEffect(()=>setDraft(String(value)),[value]);
  function update(next:number){
    if(!Number.isSafeInteger(next)||next<min||next>MAX_ITEM_QUANTITY)return;
    setDraft(String(onChange(next)===false?value:next));
  }
  return <div className="quantity-control" role="group" aria-label={label}>
    <button type="button" disabled={disabled||value<=min} aria-label={label+' : diminuer'} onClick={()=>update(value-1)}>−</button>
    <input type="number" inputMode="numeric" min={min} max={MAX_ITEM_QUANTITY} step={1} value={draft} disabled={disabled} aria-label={label}
      onChange={event=>{setDraft(event.target.value);if(event.target.value!=='')update(Number(event.target.value));}}
      onBlur={()=>setDraft(String(value))} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/>
    <button type="button" disabled={disabled||value>=MAX_ITEM_QUANTITY} aria-label={label+' : augmenter'} onClick={()=>update(value+1)}>+</button>
  </div>;
}
