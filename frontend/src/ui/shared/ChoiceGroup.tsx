import {useId,useState,type ReactNode} from 'react';
import {Icon} from './Icon';

export type ChoiceOption={id:string;label:ReactNode;description?:ReactNode;
 /** Why this option cannot be chosen here; replaces the description. */
 unavailable?:ReactNode;
 /** « Aucun soin adapté »: choosing it unticks the others (multi only). */
 exclusive?:boolean};
type Common={name:string;legend:ReactNode;hint?:ReactNode;options:ChoiceOption[];disabled?:boolean;className?:string;legendHidden?:boolean};
type Single=Common&{kind:'single';value:string;onChange:(value:string)=>void};
type Multi=Common&{kind:'multi';value:string[];onChange:(value:string[])=>void};
const text=(n:ReactNode)=>typeof n==='string'?n:'';

/** One question, native semantics (§5.4): single choice = radio group with round indicators,
 *  multiple choice = checkboxes with square indicators. The card is the hit area; keyboard stays native. */
export function ChoiceGroup(props:Single|Multi){
 const {kind,name,legend,hint,options,disabled,className,legendHidden}=props;
 const hintId=useId(),base=useId();
 const [said,setSaid]=useState('');
 const isOn=(id:string)=>props.kind==='single'?props.value===id:props.value.includes(id);
 function change(o:ChoiceOption,checked:boolean){
  if(props.kind==='single'){if(checked&&props.value!==o.id)props.onChange(o.id);return;}
  const current=props.value;
  if(!checked){props.onChange(current.filter(x=>x!==o.id));setSaid('');return;}
  if(o.exclusive){
   const cleared=options.filter(x=>x.id!==o.id&&current.includes(x.id)).map(x=>text(x.label)).filter(Boolean);
   props.onChange([o.id]);
   setSaid(cleared.length?`« ${text(o.label)} » choisi : ${cleared.join(', ')} décoché${cleared.length>1?'s':''}.`:'');
   return;
  }
  const exclusive=options.filter(x=>x.exclusive&&current.includes(x.id));
  props.onChange([...current.filter(x=>!exclusive.some(e=>e.id===x)),o.id]);
  setSaid(exclusive.length?`${exclusive.map(x=>`« ${text(x.label)} »`).join(', ')} décoché.`:'');
 }
 return <fieldset className={'choice-group'+(className?' '+className:'')} data-kind={kind} aria-describedby={hintId} disabled={disabled||undefined}>
  <legend className={legendHidden?'sr-only':'choice-group__legend'}>{legend}</legend>
  <p id={hintId} className="choice-group__hint"><Icon name={kind==='single'?'info':'check'} size={16}/>{hint??(kind==='single'?'Un seul choix':'Plusieurs choix possibles')}</p>
  <div className="choice-group__options">{options.map((o,i)=>{const descId=`${base}-${i}`,desc=o.unavailable??o.description;
   return <label key={o.id} className="option" data-kind={kind} data-exclusive={o.exclusive||undefined}>
    <input className="option__input" type={kind==='single'?'radio':'checkbox'} name={name} value={o.id} checked={isOn(o.id)} disabled={!!o.unavailable||undefined} aria-describedby={desc?descId:undefined} onChange={e=>change(o,e.target.checked)}/>
    <span className="option__indicator" aria-hidden="true">{kind==='multi'&&<Icon name="check" size={14}/>}</span>
    <span className="option__body"><span className="option__title">{o.label}</span>{desc&&<span className="option__desc" id={descId}>{desc}</span>}</span>
   </label>;})}</div>
  <p className="choice-group__status" role="status" aria-live="polite">{said}</p>
 </fieldset>;
}
