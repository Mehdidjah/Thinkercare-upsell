import {useRef,type MouseEvent,type ReactNode} from 'react';
import {Icon} from './Icon';

type Variant='primary'|'secondary'|'ghost'|'danger';
type Props={
 variant?:Variant;size?:'sm'|'md'|'lg';block?:boolean;type?:'button'|'submit';className?:string;
 /** Native disabled: the action does not exist right now (nothing to explain). */
 disabled?:boolean;
 /** Disabled with a reason (§5.2): stays focusable, announces the reason, runs onBlocked instead of onClick. */
 blocked?:boolean;reasonId?:string;onBlocked?:()=>void;
 busy?:boolean;busyLabel?:ReactNode;
 /** Ignore repeat activations for 400ms (on by default for the primary action). */
 guard?:boolean;
 onClick?:(event:MouseEvent<HTMLButtonElement>)=>void;
 children:ReactNode;
 'aria-label'?:string;'aria-expanded'?:boolean;'aria-controls'?:string;'aria-haspopup'?:'dialog'|'menu'|boolean;form?:string;
} ;

/** The one button of the design system: btn--primary (one per view), --secondary, --ghost and --danger (dialogs only). */
export function Button({variant='secondary',size='md',block=false,type='button',className,disabled,blocked=false,reasonId,onBlocked,busy=false,busyLabel,guard,onClick,children,...aria}:Props){
 const last=useRef(0);
 const classes=['btn','btn--'+variant,size!=='md'&&'btn--'+size,block&&'btn--block',className].filter(Boolean).join(' ');
 function handle(event:MouseEvent<HTMLButtonElement>){
  if(blocked){event.preventDefault();onBlocked?.();return;}
  if(busy){event.preventDefault();return;}
  if(guard??variant==='primary'){const now=performance.now();if(now-last.current<400){event.preventDefault();return;}last.current=now;}
  onClick?.(event);
 }
 return <button type={type} className={classes} disabled={disabled||undefined} aria-disabled={blocked||undefined} aria-describedby={blocked&&reasonId?reasonId:undefined} aria-busy={busy||undefined} onClick={handle} {...aria}>
  {blocked&&<Icon name="lock"/>}{busy&&<span className="spinner" aria-hidden="true"/>}{busy&&busyLabel?busyLabel:children}
 </button>;
}
