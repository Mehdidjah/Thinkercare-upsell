import {useEffect,useState} from 'react';
import {initialItems,localDay,quantityLabel,type Product,type CallMeta} from '@touche/domain';
import {requestJson} from '../../data/api';
import {reportCache} from '../../data/report-cache';
import {useLiveReport,reportRequest} from '../../data/use-live-report';
import {Icon} from '../shared/Icon';
import {useConfirm} from '../shared/Confirm';
import {useNotify} from '../shell/Notifications';

/** One open reminder as GET ?action=reminders returns it (own reminders for an adviser, all for managers). */
export type Reminder={id:string;user_id:string;operator:string;base_id:string;outcome:string;created_at:string;callback_at:string;order_ref?:string|null;meta:CallMeta};

const when=(at:string)=>new Date(at).toLocaleString('fr-FR',{timeZone:'Africa/Algiers',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
const reference=(r:Reminder)=>r.order_ref||r.meta?.orderRef||r.id.slice(0,8);
/** Due today (Alger) or overdue. */
export const isDue=(r:Pick<Reminder,'callback_at'>,today=localDay(new Date()))=>!!r.callback_at&&localDay(r.callback_at)<=today;
export const isLate=(r:Pick<Reminder,'callback_at'>)=>Date.parse(r.callback_at)<Date.now();

/** Advisers only: how many of their reminders are due today or late. Polls with the other live reports (30 s,
 *  focus, after a save) and shares their cache, so Ma progression and the badge make one request. */
export function useDueReminders(enabled:boolean){
 const report=useLiveReport<{reminders:Reminder[]}>(enabled?'action=reminders':null,(signal,o)=>reportRequest('?action=reminders',signal,o));
 const today=localDay(new Date());
 return enabled?(report.data?.reminders??[]).filter(r=>isDue(r,today)).length:0;
}

/** How long « Annuler » stays offered after « Marquer traité ». */
export const UNDO_MS=15_000;
export type UndoOffer={id:string;ref:string;userId:string};

/** The « Annuler » offer after « Marquer traité » (PN5): one at a time, withdrawn after `ms` (the clock stops
 *  while the notice has the focus), and only usable by the account that marked the reminder. */
export function createUndo(onChange:(offer:UndoOffer|null)=>void,ms=UNDO_MS){
 let offer:UndoOffer|null=null,timer:ReturnType<typeof setTimeout>|undefined,closed=false;
 const arm=()=>{clearTimeout(timer);timer=offer?setTimeout(()=>set(null),ms):undefined;};
 function set(next:UndoOffer|null){offer=next;arm();onChange(next);}
 return {
  current:()=>offer,
  /** False once the view is gone (a request that ends after it): nothing is offered then. */
  start:(next:UndoOffer)=>{if(closed)return false;set(next);return true;},
  hold:(held:boolean)=>{if(held)clearTimeout(timer);else arm();},
  /** Withdraws the offer and says whether `userId` (the account the tab works for now) may use it. */
  take:(userId:string|null)=>{const o=offer;if(!o)return null;set(null);return {offer:o,allowed:o.userId===userId};},
  dismiss:()=>{if(offer)set(null);},
  /** The view is shown (again, after React's development remount). */
  open:()=>{closed=false;},
  /** The view is gone: drop the offer and its clock without rendering, and offer nothing more. */
  dispose:()=>{closed=true;clearTimeout(timer);offer=null;},
 };
}

/** « Marquer traité » (PN5): one tap and an « Annuler » notice (`notice`, rendered by the reminders view) when the
 *  server can reopen a reminder (features: 'reopen-reminder'); otherwise a confirmation first, since nothing can
 *  undo it. No « Annuler » when the server says it was already done; the offer ends after 15 s, with the view
 *  (`dismiss`, unmount) and never reopens for another account than the one that marked it. */
export function useCompleteReminder(features:string[]|undefined,onError:(message:string)=>void){
 const confirm=useConfirm(),{notify,announce}=useNotify();
 const [offer,setOffer]=useState<UndoOffer|null>(null);
 const [undo]=useState(()=>createUndo(setOffer));
 // Leaving the view (or signing out, which unmounts it) withdraws « Annuler ».
 useEffect(()=>{undo.open();return()=>undo.dispose();},[undo]);
 async function complete(r:Reminder){
  const undoable=!!features?.includes('reopen-reminder'),ref=reference(r);
  if(!undoable&&!(await confirm({title:'Marquer ce rappel comme traité ?',body:<p>Le rappel du {when(r.callback_at)} (dossier {ref}) quittera la liste des rappels. Il ne pourra pas être rouvert depuis l’application.</p>,cancelLabel:'Garder le rappel',confirmLabel:'Marquer traité',tone:'primary'})))return;
  try{
   const result=await requestJson('',{action:'complete-reminder',callId:r.id});
   if(!undoable)return;
   // Marked elsewhere first (another tab, a manager): this tap changed nothing, so there is nothing to undo.
   if(result?.alreadyDone){notify({kind:'info',title:`Rappel ${ref} déjà marqué traité.`});return;}
   const userId=reportCache.currentUser();
   if(!userId||!undo.start({id:r.id,ref,userId})){notify({kind:'success',title:`Rappel ${ref} marqué traité.`});return;}
   announce(`Rappel ${ref} marqué traité. Vous pouvez annuler pendant 15 secondes.`);
  }catch(e){onError((e as Error).message);}
 }
 async function reopen(){
  const taken=undo.take(reportCache.currentUser());if(!taken)return;
  const {offer:o,allowed}=taken;
  if(!allowed){notify({kind:'error',title:`Rappel ${o.ref} non rouvert.`,detail:'Ce poste n’est plus connecté avec le compte qui l’a marqué traité.'});return;}
  try{await requestJson('',{action:'reopen-reminder',id:o.id});notify({kind:'info',title:`Rappel ${o.ref} rouvert.`});}
  catch(e){notify({kind:'error',title:`Le rappel ${o.ref} n’a pas pu être rouvert.`,detail:(e as Error).message});}
 }
 const notice=offer&&<div className="notice notice--success reminder-undo" onFocus={()=>undo.hold(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))undo.hold(false);}}><Icon name="check" className="notice__icon"/><p className="notice__text">Rappel {offer.ref} marqué traité.</p><button type="button" className="btn btn--secondary btn--sm" onClick={()=>void reopen()}>Annuler</button></div>;
 return {complete,reopen,notice,dismiss:undo.dismiss};
}

/** Reminders as a table, and as cards on phones (≤650px, the account-table pattern): when, dossier, adviser,
 *  initial products, then the actions. Explicit roles keep table semantics when the cells become blocks. */
export function ReminderTable({reminders,products=[],showOperator=false,caption,resume,canComplete,complete}:{reminders:Reminder[];products?:Product[];showOperator?:boolean;caption:string;resume?:(r:Reminder)=>void;canComplete:(r:Reminder)=>boolean;complete:(r:Reminder)=>void}){
 return <div className="data-table data-table--cards reminder-table"><table role="table"><caption className="sr-only">{caption}</caption>
  <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Prévu (Alger)</th><th scope="col" role="columnheader">Dossier</th>{showOperator&&<th scope="col" role="columnheader">Conseillère</th>}<th scope="col" role="columnheader">Produits initiaux</th><th scope="col" role="columnheader" className="data-table__action">Action</th></tr></thead>
  <tbody role="rowgroup">{reminders.map(r=>{const ref=reference(r);return <tr key={r.id} role="row">
   <th scope="row" role="rowheader"><time className="num" dateTime={r.callback_at}>{when(r.callback_at)}</time>{isLate(r)&&<small><span className="tag tag--warning"><Icon name="alert"/>En retard</span></small>}</th>
   <td role="cell" data-label="Dossier">{ref}</td>
   {showOperator&&<td role="cell" data-label="Conseillère">{r.operator}</td>}
   <td role="cell" data-label="Produits initiaux" data-span="full">{initialItems(r).map(p=>quantityLabel({...p,name:products.find(x=>x.id===p.id)?.name||p.name})).join(' + ')}</td>
   <td role="cell" className="data-table__action"><div className="row-actions">{resume&&<button type="button" className="link-btn" aria-label={'Préparer le rappel '+ref} onClick={()=>resume(r)}>Préparer le rappel</button>}{canComplete(r)&&<button type="button" className="link-btn" aria-label={'Marquer traité le rappel '+ref} onClick={()=>complete(r)}>Marquer traité</button>}</div></td>
  </tr>;})}</tbody>
 </table></div>;
}
