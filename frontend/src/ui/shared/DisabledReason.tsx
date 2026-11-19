import {type ReactNode} from 'react';
import {Icon} from './Icon';

export type ReasonItem={label:ReactNode;done:boolean};

/** The reason next to a disabled-with-reason action (§5.2): what is still missing, and what is already done.
 *  Point the button's aria-describedby at `id` (Button reasonId). */
export function DisabledReason({id,title,items}:{id:string;title:ReactNode;items:ReasonItem[]}){
 return <div id={id} className="reason">
  <p className="reason__title">{title}</p>
  <ul className="reason__list" role="list">{items.map((m,i)=><li key={i} className="reason__item" data-done={m.done}><Icon name={m.done?'check':'clock'} size={16}/>{m.label}{m.done&&<span className="sr-only"> : fait</span>}</li>)}</ul>
 </div>;
}
