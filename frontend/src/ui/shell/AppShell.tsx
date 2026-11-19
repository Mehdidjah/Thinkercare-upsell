import {useEffect,type ReactNode} from 'react';
import {type State} from '../shared/types';
import {OfflineBanner} from './OfflineBanner';
import {Sidebar} from './Sidebar';
import {Topbar} from './Topbar';

/** Frame of every signed-in screen: sidebar, top bar, offline banner, page content, footer and the open product sheet.
 *  Toasts and confirmations are mounted once around the app (main.tsx). */
export function AppShell({state,view,setView,titles,signingOut,signOut,newCall,fatal,load,modal,children}:{state:State;view:string;setView:(view:string)=>void;titles:Record<string,string>;signingOut:boolean;signOut:()=>Promise<void>;newCall:()=>void;fatal:string;load:()=>Promise<void>;modal:ReactNode;children:ReactNode}){
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
   const r=el.getBoundingClientRect();
   const top=document.querySelector('.shell-topbar')?.getBoundingClientRect().bottom??0;
   const bottom=Math.min(window.innerHeight,...[...document.querySelectorAll<HTMLElement>('.call-actions,.call-bar,.shell-sidebar')].map(b=>b.getBoundingClientRect()).filter(b=>b.height>0&&b.top>window.innerHeight/2).map(b=>b.top));
   if(r.height>bottom-top)return;
   if(r.bottom>bottom-8)window.scrollBy({top:r.bottom-bottom+16,behavior:'instant'});
   else if(r.top<top+8)window.scrollBy({top:r.top-top-16,behavior:'instant'});
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
   {fatal&&<OfflineBanner fatal={fatal} load={load}/>}
   <main className="shell-content" id="contenu" tabIndex={-1}>
    {children}
   </main>
   <footer className="shell-footer"><p>ThinkerCare, espace des équipes B2C. Prix hors livraison. Aucun nom ni téléphone de cliente n’est collecté.</p></footer>
  </div>
  {modal}
 </div>;
}
