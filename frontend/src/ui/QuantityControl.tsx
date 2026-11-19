import {useEffect,useId,useState} from 'react';
import {MAX_ITEM_QUANTITY} from '@touche/domain';

const below=(min:number)=>min>1?`${min} au minimum : la quantité de la commande initiale.`:`${min} au minimum.`;

/** What a typed quantity does (QTY): '' waits for the next digit; a whole number in range applies. A number below the
 *  minimum may be the start of a valid one (« 1 » on the way to « 12 » with a minimum of 2): it stays in the field and
 *  waits (`pending`, with the reason shown if the field is left that way). Only what can never become valid (not a whole
 *  number, above the maximum) goes back at once with the reason. */
export function readQuantity(text:string,min:number):{apply:number}|{wait:true}|{pending:string}|{hint:string}{
  if(text==='')return {wait:true};
  const next=Number(text);
  if(!/^\d+$/.test(text)||!Number.isSafeInteger(next))return {hint:'Nombre entier uniquement.'};
  if(next>MAX_ITEM_QUANTITY)return {hint:`${MAX_ITEM_QUANTITY} au maximum.`};
  if(next<min)return {pending:below(min)};
  return {apply:next};
}

/** The field as typed, and the hint under it. */
export type QuantityField={draft:string;hint:string};
/** A keystroke: the field to show, and the quantity to apply if any. */
export function typeQuantity(text:string,min:number,value:number):{field:QuantityField;apply?:number}{
  const read=readQuantity(text,min);
  if('hint' in read)return {field:{draft:String(value),hint:read.hint}};
  return {field:{draft:text,hint:''},apply:'apply' in read?read.apply:undefined};
}
/** Leaving the field (blur or Enter): it shows the current quantity again; a number left below the minimum says why. */
export function settleQuantity(field:QuantityField,min:number,value:number):QuantityField{
  const read=readQuantity(field.draft,min);
  return {draft:String(value),hint:'pending' in read?read.pending:''};
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
    const {field,apply}=typeQuantity(text,min,value);
    setDraft(field.draft);setHint(field.hint);
    if(apply!==undefined)update(apply);
  }
  function settle(){const field=settleQuantity({draft,hint},min,value);setDraft(field.draft);setHint(field.hint);}
  return <>
    <div className="quantity-control" role="group" aria-label={label}>
      <button type="button" disabled={disabled||value<=min} aria-label={label+' : diminuer'} onClick={()=>{setHint('');update(value-1);}}>−</button>
      <input type="number" inputMode="numeric" min={min} max={MAX_ITEM_QUANTITY} step={1} value={draft} disabled={disabled} aria-label={label} aria-describedby={hint?hintId:undefined} aria-invalid={hint?true:undefined}
        onChange={event=>type(event.target.value)}
        onBlur={settle} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/>
      <button type="button" disabled={disabled||value>=MAX_ITEM_QUANTITY} aria-label={label+' : augmenter'} onClick={()=>{setHint('');update(value+1);}}>+</button>
    </div>
    {hint&&<p id={hintId} className="quantity-hint" role="status">{hint}</p>}
  </>;
}
