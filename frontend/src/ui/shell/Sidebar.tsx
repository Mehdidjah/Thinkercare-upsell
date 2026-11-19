import {canManageWorkspace,accountRoleLabel} from '@touche/domain';
import {Icon} from '../shared/Icon';
import {type State} from '../shared/types';

/** Visible label when the sidebar is compact (761 to 1199px) or becomes the bottom bar (≤760px). */
const SHORT:Record<string,string>={call:'Appel',progress:'Progression',catalogue:'Catalogue',coverage:'Parcours',protocol:'Protocole',results:'Pilotage',contributions:'Apports',admin:'Gestion'};
const ICONS:Record<string,string>={call:'call',progress:'trend',catalogue:'grid',coverage:'route',protocol:'shield',results:'chart',contributions:'coins',admin:'sliders'};

/** The compact sidebar scrolls, so its tooltips are fixed-position: this pins them to the hovered item. */
function placeTip(event:{currentTarget:HTMLElement}){const r=event.currentTarget.getBoundingClientRect();event.currentTarget.style.setProperty('--tip-y',r.top+r.height/2+'px');}

export function Sidebar({state,view,setView,titles,signingOut,signOut}:{state:State;view:string;setView:(view:string)=>void;titles:Record<string,string>;signingOut:boolean;signOut:()=>Promise<void>}){
 const manager=canManageWorkspace(state.user);
 const items=[...(manager?['results','contributions']:['progress']),'call','catalogue','coverage','protocol',...(manager?['admin']:[])];
 return <aside className="shell-sidebar">
  <div className="shell-sidebar__brand">
   <button type="button" className="shell-brand" onClick={()=>setView('call')} aria-label="Touché Conseil, accueil"><span className="wordmark">touché</span></button>
   <p className="shell-sidebar__context">Espace équipes B2C</p>
  </div>
  <nav className="shell-nav" aria-label="Navigation principale">
   <ul className="shell-nav__list" role="list">{items.map(v=><li key={v}>
    <button type="button" className="shell-nav__item" aria-label={titles[v]} aria-current={view===v?'page':undefined} onClick={()=>setView(v)} onPointerEnter={placeTip} onFocus={placeTip}>
     <Icon name={ICONS[v]}/><span className="shell-nav__full">{titles[v]}</span><span className="shell-nav__short">{SHORT[v]}</span>
     {SHORT[v]!==titles[v]&&<span className="tooltip" aria-hidden="true">{titles[v]}</span>}
    </button>
   </li>)}</ul>
  </nav>
  <div className="shell-sidebar__foot">
   <p className="shell-sidebar__status">{state.clinical.validated
    ?<span className="tag tag--success"><Icon name="check"/>Protocole validé en interne</span>
    :<span className="tag tag--warning"><Icon name="alert"/>Pilote : validation médicale à finaliser</span>}</p>
   <p className="shell-sidebar__privacy"><Icon name="shield"/><span>Un conseil personnalisé. Aucun dossier médical stocké.</span></p>
   <button type="button" className="shell-account" aria-label={'Mon compte, '+state.user.label} aria-current={view==='admin'&&!manager?'page':undefined} onClick={()=>setView('admin')}>
    <span className="avatar" aria-hidden="true">{state.user.label.slice(0,1)}</span>
    <span className="shell-account__text"><span className="shell-account__name">{state.user.label}</span><span className="shell-account__role">{accountRoleLabel(state.user.role)}</span></span>
    <span className="shell-account__short" aria-hidden="true">Compte</span>
   </button>
   <button type="button" className="shell-logout" aria-label="Se déconnecter" disabled={signingOut} onClick={signOut}>
    <Icon name="logout"/><span className="shell-logout__label">{signingOut?'Déconnexion…':'Se déconnecter'}</span><span className="shell-logout__short" aria-hidden="true">Quitter</span>
   </button>
  </div>
 </aside>;
}
