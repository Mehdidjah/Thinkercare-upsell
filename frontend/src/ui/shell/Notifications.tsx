import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {Icon} from '../shared/Icon';

export type NoteKind='success'|'info'|'error';
export type Note={id:number;kind:NoteKind;title:string;detail?:string;action?:{label:string;run:()=>void}};
type Notify={notify:(note:Omit<Note,'id'>)=>void;announce:(text:string)=>void};
const NotificationsContext=createContext<Notify>({notify:()=>{},announce:()=>{}});
/** notify({kind:'error'}) only for failures not tied to a control; announce() for screen-reader-only updates. */
export const useNotify=()=>useContext(NotificationsContext);

/** Toasts and live regions (§5.11), mounted once around the app. Success and info share one polite region and
 *  hide after 6 s (paused on hover or focus; kept while they carry an action). Errors use role="alert" and stay
 *  until closed. Both regions exist, empty, before the first message so every message is announced. */
export function NotificationsProvider({children}:{children:ReactNode}){
 const [polite,setPolite]=useState<Note|null>(null),[errors,setErrors]=useState<Note[]>([]),[said,setSaid]=useState('');
 const seq=useRef(0);
 const notify=useCallback((n:Omit<Note,'id'>)=>{const note={...n,id:++seq.current};if(n.kind==='error')setErrors(e=>[...e.slice(-2),note]);else setPolite(note);},[]);
 const announce=useCallback((text:string)=>{setSaid('');requestAnimationFrame(()=>setSaid(text));},[]);
 const value=useMemo(()=>({notify,announce}),[notify,announce]);
 return <NotificationsContext value={value}>
  {children}
  <section className="toast-region" aria-label="Notifications">
   <div className="toast-stack" role="status" aria-live="polite">{polite&&<Toast key={polite.id} note={polite} autoHide={!polite.action} onClose={()=>setPolite(null)}/>}</div>
   <div className="toast-stack" role="alert">{errors.map(e=><Toast key={e.id} note={e} autoHide={false} onClose={()=>setErrors(x=>x.filter(y=>y.id!==e.id))}/>)}</div>
  </section>
  <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{said}</p>
 </NotificationsContext>;
}

function Toast({note,autoHide,onClose}:{note:Note;autoHide:boolean;onClose:()=>void}){
 const [paused,setPaused]=useState(false);
 const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{if(!autoHide||paused)return;const t=setTimeout(()=>close.current(),6000);return()=>clearTimeout(t);},[autoHide,paused]);
 return <div className={`toast toast--${note.kind}`} onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)}
  onFocus={()=>setPaused(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setPaused(false);}}>
  <Icon name={note.kind==='error'?'alert':note.kind==='success'?'check':'info'} className="toast__icon"/>
  <div className="toast__text"><p className="toast__title">{note.title}</p>{note.detail&&<p className="toast__detail">{note.detail}</p>}</div>
  {note.action&&<button type="button" className="btn btn--ghost btn--sm" onClick={note.action.run}>{note.action.label}</button>}
  <button type="button" className="icon-btn" aria-label={note.kind==='error'?'Fermer le message d’erreur':'Fermer le message'} onClick={onClose}><Icon name="close"/></button>
 </div>;
}
