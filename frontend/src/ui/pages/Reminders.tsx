import {initialItems,localDay,quantityLabel,type Product,type CallMeta} from '@touche/domain';
import {requestJson} from '../../data/api';
import {useLiveReport} from '../../data/use-live-report';
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
 const report=useLiveReport<{reminders:Reminder[]}>(enabled?'action=reminders':null,signal=>requestJson('?action=reminders',undefined,signal));
 const today=localDay(new Date());
 return enabled?(report.data?.reminders??[]).filter(r=>isDue(r,today)).length:0;
}

/** « Marquer traité » (PN5): one tap and an « Annuler » notice when the server can reopen a reminder
 *  (features: 'reopen-reminder'); otherwise a confirmation first, since nothing can undo it. */
export function useCompleteReminder(features:string[]|undefined,onError:(message:string)=>void){
 const confirm=useConfirm(),{notify}=useNotify();
 return async(r:Reminder)=>{
  const undo=!!features?.includes('reopen-reminder'),ref=reference(r);
  if(!undo&&!(await confirm({title:'Marquer ce rappel comme traité ?',body:<p>Le rappel du {when(r.callback_at)} (dossier {ref}) quittera la liste des rappels. Il ne pourra pas être rouvert depuis l’application.</p>,cancelLabel:'Garder le rappel',confirmLabel:'Marquer traité',tone:'primary'})))return;
  try{
   await requestJson('',{action:'complete-reminder',callId:r.id});
   if(undo)notify({kind:'success',title:`Rappel ${ref} marqué traité.`,action:{label:'Annuler',run:async()=>{
    try{await requestJson('',{action:'reopen-reminder',id:r.id});notify({kind:'info',title:`Rappel ${ref} rouvert.`});}
    catch(e){onError((e as Error).message);}
   }}});
  }catch(e){onError((e as Error).message);}
 };
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
