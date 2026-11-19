import {useEffect,useState} from 'react';
import {canManageWorkspace,accountRoleLabel} from '@touche/domain';
import {Icon} from '../shared/Icon';
import {Wordmark} from '../shared/Wordmark';
import {type State} from '../shared/types';
import {PlusSheet} from './PlusSheet';
import {useDueReminders} from '../pages/Reminders';

/** Visible label when the sidebar is compact (761 to 1199px) or becomes the bottom bar (≤760px). */
export const SHORT:Record<string,string>={call:'Appel',progress:'Progression',catalogue:'Catalogue',coverage:'Parcours',protocol:'Protocole',results:'Pilotage',contributions:'Apports',admin:'Gestion',account:'Compte'};
export const ICONS:Record<string,string>={call:'call',progress:'trend',catalogue:'grid',coverage:'route',protocol:'shield',results:'chart',contributions:'coins',admin:'sliders',account:'user'};

/** Sidebar order (§6.2) and the four destinations the phone bar keeps beside « Plus ». */
export function navItems(manager:boolean){
 const items=manager?['results','contributions','call','catalogue','coverage','protocol','admin']:['call','progress','catalogue','coverage','protocol'];
 const phone=manager?['results','contributions','call','admin']:['call','progress','catalogue','coverage'];
 return {items,phone,more:items.filter(v=>!phone.includes(v))};
}

/** A link inside a page that opens another view (« Voir mes rappels » on the call): the sidebar holds setView. */
const OPEN_VIEW='tc-open-view';
export function openView(view:string){window.dispatchEvent(new CustomEvent(OPEN_VIEW,{detail:view}));}

/** The compact sidebar scrolls, so its tooltips are fixed-position: this pins them to the hovered item. */
function placeTip(event:{currentTarget:HTMLElement}){const r=event.currentTarget.getBoundingClientRect();event.currentTarget.style.setProperty('--tip-y',r.top+r.height/2+'px');}

/** One navigation landmark: the labelled sidebar (≥1200), the compact sidebar with visible short labels
 *  (761 to 1199) and the phone bar of four destinations plus « Plus » (≤760). Each item's accessible name is
 *  its visible label; the full name shows as a tooltip where the label is shortened. */
export function Sidebar({state,view,setView,titles,signingOut,signOut}:{state:State;view:string;setView:(view:string)=>void;titles:Record<string,string>;signingOut:boolean;signOut:()=>Promise<void>}){
 const manager=canManageWorkspace(state.user);
 const {items,phone,more}=navItems(manager);
 const [plusOpen,setPlusOpen]=useState(false);
 const inMore=more.includes(view)||view==='account';
 // Advisers: reminders due today or late, on « Ma progression » (X7).
 const due=useDueReminders(!manager);
 useEffect(()=>{const open=(e:Event)=>{const v=(e as CustomEvent<string>).detail;if(items.includes(v)||v==='account')setView(v);};window.addEventListener(OPEN_VIEW,open);return()=>window.removeEventListener(OPEN_VIEW,open);},[items.join(),setView]);
 return <aside className="shell-sidebar">
  <div className="shell-sidebar__brand">
   <button type="button" className="shell-brand" onClick={()=>setView('call')} aria-label="ThinkerCare, Appel guidé"><Wordmark/></button>
   <p className="shell-sidebar__context">{manager?accountRoleLabel(state.user.role):'Espace conseil'}</p>
  </div>
  <nav className="shell-nav" aria-label="Navigation principale">
   <ul className="shell-nav__list" role="list">{items.map(v=><li key={v} data-phone={phone.includes(v)||undefined}>
    <button type="button" className="shell-nav__item" aria-current={view===v?'page':undefined} onClick={()=>setView(v)} onPointerEnter={placeTip} onFocus={placeTip}>
     <Icon name={ICONS[v]}/><span className="shell-nav__full">{titles[v]}</span><span className="shell-nav__short">{SHORT[v]}</span>
     {SHORT[v]!==titles[v]&&<span className="tooltip" aria-hidden="true">{titles[v]}</span>}
     {v==='progress'&&due>0&&<span className="nav-badge"><span aria-hidden="true">{due}</span><span className="sr-only">, {due} rappel{due>1?'s':''} à traiter</span></span>}
    </button>
   </li>)}
    <li className="shell-nav__plus"><button type="button" className="shell-nav__item" aria-haspopup="dialog" aria-expanded={plusOpen} aria-current={inMore?'true':undefined} data-current={inMore||undefined} onClick={()=>setPlusOpen(true)}>
     <Icon name="more"/><span className="shell-nav__short">{inMore?SHORT[view]:'Plus'}</span>
    </button></li>
   </ul>
  </nav>
  <div className="shell-sidebar__foot">
   <p className="shell-sidebar__status">{state.clinical.validated
    ?<span className="tag tag--success"><Icon name="check"/>Protocole validé en interne</span>
    :<span className="tag tag--warning"><Icon name="alert"/>Pilote : validation médicale à finaliser</span>}</p>
   <p className="shell-sidebar__privacy"><Icon name="shield"/><span>Un conseil personnalisé. Aucun dossier médical stocké.</span></p>
   <button type="button" className="shell-account" aria-current={view==='account'?'page':undefined} onClick={()=>setView('account')} onPointerEnter={placeTip} onFocus={placeTip}>
    <span className="avatar" aria-hidden="true">{state.user.label.slice(0,1)}</span>
    <span className="sr-only">Mon compte : </span>
    <span className="shell-account__text"><span className="shell-account__name">{state.user.label}</span><span className="shell-account__role">{accountRoleLabel(state.user.role)}</span></span>
    <span className="shell-account__short">Compte</span>
   </button>
   <button type="button" className="shell-logout" disabled={signingOut} onClick={signOut}>
    <Icon name="logout"/><span className="shell-logout__label">{signingOut?'Déconnexion…':'Se déconnecter'}</span><span className="shell-logout__short">Déconnexion</span>
   </button>
  </div>
  {plusOpen&&<PlusSheet state={state} view={view} more={more} titles={titles} setView={setView} signingOut={signingOut} signOut={signOut} onClose={()=>setPlusOpen(false)}/>}
 </aside>;
}
