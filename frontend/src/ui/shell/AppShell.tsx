import {type ReactNode} from 'react';
import {type State} from '../shared/types';
import {OfflineBanner} from './OfflineBanner';
import {Sidebar} from './Sidebar';
import {Topbar} from './Topbar';

/** Frame of every signed-in screen: sidebar, top bar, offline banner, page content, footer and the open product sheet.
 *  Toasts and confirmations are mounted once around the app (main.tsx). */
export function AppShell({state,view,setView,titles,signingOut,signOut,newCall,fatal,load,modal,children}:{state:State;view:string;setView:(view:string)=>void;titles:Record<string,string>;signingOut:boolean;signOut:()=>Promise<void>;newCall:()=>void;fatal:string;load:()=>Promise<void>;modal:ReactNode;children:ReactNode}){
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
