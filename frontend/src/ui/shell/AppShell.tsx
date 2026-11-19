import {type ReactNode} from 'react';
import {type State} from '../shared/types';
import {OfflineBanner} from './OfflineBanner';
import {Sidebar} from './Sidebar';
import {Topbar} from './Topbar';
import {Toast} from './Toast';

/** Frame of every signed-in screen: sidebar, top bar, offline banner, page content, footer, toast and the open product sheet. */
export function AppShell({state,view,setView,titles,signingOut,signOut,baseId,saved,demo,reset,fatal,load,toast,setToast,modal,children}:{state:State;view:string;setView:(view:string)=>void;titles:Record<string,string>;signingOut:boolean;signOut:()=>Promise<void>;baseId:string;saved:boolean;demo:boolean;reset:()=>void;fatal:string;load:()=>Promise<void>;toast:string;setToast:(toast:string)=>void;modal:ReactNode;children:ReactNode}){
 return <div className="shell">
  <a className="skip-link" href="#contenu">Aller au contenu</a>
  <Sidebar state={state} view={view} setView={setView} titles={titles} signingOut={signingOut} signOut={signOut}/>
  <div className="shell-main">
   <Topbar state={state} view={view} setView={setView} titles={titles} signingOut={signingOut} signOut={signOut} baseId={baseId} saved={saved} demo={demo} reset={reset}/>
   {fatal&&<OfflineBanner fatal={fatal} load={load}/>}
   <main className="shell-content" id="contenu" tabIndex={-1}>
    {children}
   </main>
   <footer className="shell-footer"><p>ThinkerCare, espace des équipes B2C. Prix hors livraison. Aucun nom ni téléphone de cliente n’est collecté.</p></footer>
  </div>
  {toast&&<Toast toast={toast} setToast={setToast}/>}
  {modal}
 </div>;
}
