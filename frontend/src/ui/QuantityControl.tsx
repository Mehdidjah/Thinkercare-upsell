import {useEffect,useId,useState} from 'react';
import {MAX_ITEM_QUANTITY} from '@touche/domain';

/** What a typed quantity does (QTY): '' waits for the next digit; a whole number in range applies; anything else is
 *  never shown, the field goes back to the current quantity and says why. */
export function readQuantity(text:string,min:number):{apply:number}|{wait:true}|{hint:string}{
  if(text==='')return {wait:true};
  const next=Number(text);
  if(!Number.isSafeInteger(next))return {hint:'Nombre entier uniquement.'};
  if(next<min)return {hint:min>1?`${min} au minimum : la quantité de la commande initiale.`:`${min} au minimum.`};
  if(next>MAX_ITEM_QUANTITY)return {hint:`${MAX_ITEM_QUANTITY} au maximum.`};
  return {apply:next};
}

export default function QuantityControl({label,value,min=1,disabled=false,onChange}:{
  label:string;value:number;min?:number;disabled?:boolean;onChange:(value:number)=>boolean|void;
}) {
  const [draft,setDraft]=useState(String(value)),[hint,setHint]=useState('');
  const hintId=useId();
  useEffect(()=>setDraft(String(value)),[value]);
  function update(next:number){
    // An unchanged value never reaches the call (CN1): retyping the same quantity changes nothing.
    if(!Number.isSafeInteger(next)||next<min||next>MAX_ITEM_QUANTITY||next===value)return;
    setDraft(String(onChange(next)===false?value:next));
  }
  function type(text:string){
    const read=readQuantity(text,min);
    if('hint' in read){setDraft(String(value));setHint(read.hint);return;}
    setDraft(text);setHint('');
    if('apply' in read)update(read.apply);
  }
  return <>
    <div className="quantity-control" role="group" aria-label={label}>
      <button type="button" disabled={disabled||value<=min} aria-label={label+' : diminuer'} onClick={()=>{setHint('');update(value-1);}}>−</button>
      <input type="number" inputMode="numeric" min={min} max={MAX_ITEM_QUANTITY} step={1} value={draft} disabled={disabled} aria-label={label} aria-describedby={hint?hintId:undefined} aria-invalid={hint?true:undefined}
        onChange={event=>type(event.target.value)}
        onBlur={()=>{setDraft(String(value));setHint('');}} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/>
      <button type="button" disabled={disabled||value>=MAX_ITEM_QUANTITY} aria-label={label+' : augmenter'} onClick={()=>{setHint('');update(value+1);}}>+</button>
    </div>
    {hint&&<p id={hintId} className="quantity-hint" role="status">{hint}</p>}
  </>;
}
