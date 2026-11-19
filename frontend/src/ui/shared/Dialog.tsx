import {useEffect,useLayoutEffect,useRef,type ReactNode} from 'react';

type Variant='dialog'|'confirm'|'sheet';

/** Every modal of the app (§5.12): native <dialog> opened with showModal(), so the background is inert and
 *  Tab stays inside. Focus moves to [data-autofocus] (or the [data-dialog-title]) on open, Escape calls onClose,
 *  and focus returns to the opener on close and on unmount. */
export function Dialog({open,onClose,labelledBy,variant='dialog',dismissOnBackdrop=false,className,children}:{
 open:boolean;onClose:()=>void;labelledBy:string;variant?:Variant;dismissOnBackdrop?:boolean;className?:string;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null),opener=useRef<HTMLElement|null>(null);
 const restore=()=>{const target=opener.current;opener.current=null;if(target?.isConnected)requestAnimationFrame(()=>target.focus({preventScroll:false}));};
 useLayoutEffect(()=>{
  const d=ref.current;if(!d)return;
  if(open&&!d.open){
   opener.current=document.activeElement instanceof HTMLElement&&document.activeElement!==document.body?document.activeElement:null;
   d.showModal();
   (d.querySelector<HTMLElement>('[data-autofocus]')??d.querySelector<HTMLElement>('[data-dialog-title]'))?.focus();
  }else if(!open&&d.open){d.close();restore();}
 },[open]);
 useEffect(()=>()=>restore(),[]);
 return <dialog ref={ref} className={`dialog dialog--${variant}${className?' '+className:''}`} aria-labelledby={labelledBy}
  onCancel={e=>{e.preventDefault();onClose();}}
  onClick={e=>{if(dismissOnBackdrop&&e.target===e.currentTarget)onClose();}}>
  <div className="dialog__frame">{children}</div>
 </dialog>;
}
