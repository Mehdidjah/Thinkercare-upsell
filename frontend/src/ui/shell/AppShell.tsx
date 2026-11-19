import {useEffect,type ReactNode} from 'react';
import {type State} from '../shared/types';
import {ViewBoundary} from '../../ErrorBoundary';
import {OfflineBanner} from './OfflineBanner';
import {Sidebar} from './Sidebar';
import {Topbar} from './Topbar';

/** How far to scroll so a focused control of `r` clears bars ending at `top` and starting at `bottom` (8px margin, 16px
 *  breathing room); 0 when it is clear or taller than the space between them. */
export function clearance(r:{top:number;bottom:number},top:number,bottom:number):number{
 if(r.bottom-r.top>bottom-top)return 0;
 if(r.bottom>bottom-8)return r.bottom-bottom+16;
 if(r.top<top+8)return r.top-top-16;
 return 0;
}
/** The nearest scrolling box around `el` below the page itself (the call rail on a laptop screen). */
function scrollBox(el:HTMLElement):HTMLElement|null{
 for(let box=el.parentElement;box&&box!==document.body&&box!==document.documentElement;box=box.parentElement){
  if(/(auto|scroll)/.test(getComputedStyle(box).overflowY)&&box.scrollHeight>box.clientHeight)return box;
 }
 return null;
}
/** Inside a scrolling box, the control clears the box's own sticky bars (the rail's total and « Copier », RAILFOCUS). */
function clearInside(el:HTMLElement){
 const box=scrollBox(el);if(!box)return;
 const b=box.getBoundingClientRect(),middle=b.top+b.height/2;
 const stuck=[...box.children].filter((c):c is HTMLElement=>c instanceof HTMLElement&&!c.contains(el)&&getComputedStyle(c).position==='sticky').map(c=>c.getBoundingClientRect()).filter(c=>c.height>0);
 const top=Math.max(b.top,...stuck.filter(c=>c.bottom<=middle).map(c=>c.bottom)),bottom=Math.min(b.bottom,...stuck.filter(c=>c.top>=middle).map(c=>c.top));
 const delta=clearance(el.getBoundingClientRect(),top,bottom);
 if(delta)box.scrollBy({top:delta,behavior:'instant'});
}

/** Frame of every signed-in screen: sidebar, top bar, offline banner, page content, footer and the open product sheet.
 *  Toasts and confirmations are mounted once around the app (main.tsx). Each view has its own error boundary (X6). */
export function AppShell({state,view,setView,titles,signingOut,signOut,newCall,fatal,offline=false,load,modal,children}:{state:State;view:string;setView:(view:string)=>void;titles:Record<string,string>;signingOut:boolean;signOut:()=>Promise<void>;newCall:()=>void;fatal:string;offline?:boolean;load:()=>Promise<void>;modal:ReactNode;children:ReactNode}){
 useEffect(()=>{
  // A control focused from the keyboard never hides under the sticky top bar or a bar docked at the bottom
  // (WCAG 2.4.11): browsers skip scroll-padding when the control is already inside the viewport. Pointer focus is
  // left alone, so a click is never moved out from under the pointer between press and release.
  let keyboard=false;
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Tab'||event.key.startsWith('Arrow'))keyboard=true;};
  const onPointer=()=>{keyboard=false;};
  const keepClear=(event:FocusEvent)=>{
   const el=event.target;
   if(!keyboard||!(el instanceof HTMLElement)||el.closest('dialog,.shell-topbar,.shell-sidebar,.call-actions,.call-bar,.toast-region'))return;
   // First inside its own scrolling box (the rail), then on the page.
   clearInside(el);
   const top=document.querySelector('.shell-topbar')?.getBoundingClientRect().bottom??0;
   const bottom=Math.min(window.innerHeight,...[...document.querySelectorAll<HTMLElement>('.call-actions,.call-bar,.shell-sidebar')].map(b=>b.getBoundingClientRect()).filter(b=>b.height>0&&b.top>window.innerHeight/2).map(b=>b.top));
   const delta=clearance(el.getBoundingClientRect(),top,bottom);
   if(delta)window.scrollBy({top:delta,behavior:'instant'});
  };
  document.addEventListener('keydown',onKey,true);
  document.addEventListener('pointerdown',onPointer,true);
  document.addEventListener('focusin',keepClear);
  return()=>{document.removeEventListener('keydown',onKey,true);document.removeEventListener('pointerdown',onPointer,true);document.removeEventListener('focusin',keepClear);};
 },[]);
 return <div className="shell">
  <a className="skip-link" href="#contenu">Aller au contenu</a>
  <Sidebar state={state} view={view} setView={setView} titles={titles} signingOut={signingOut} signOut={signOut}/>
  <div className="shell-main">
   <Topbar state={state} view={view} setView={setView} titles={titles} signingOut={signingOut} signOut={signOut} newCall={newCall}/>
   {(fatal||offline)&&<OfflineBanner fatal={fatal} offline={offline} load={load}/>}
   <main className="shell-content" id="contenu" tabIndex={-1}>
    <ViewBoundary key={view} onCall={view==='call'?undefined:()=>setView('call')}>{children}</ViewBoundary>
   </main>
   <footer className="shell-footer"><p>ThinkerCare, espace des équipes B2C. Prix hors livraison. Aucun nom ni téléphone de cliente n’est collecté.</p></footer>
  </div>
  {modal}
 </div>;
}
