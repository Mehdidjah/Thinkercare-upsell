import {STAGES,normalizeOrderReference} from '@touche/domain';
import type {OrderCheck} from './orderCheck';
import {useCall} from './callModel';

/** Call context: file reference, declared purchase stage, unreachable customer (asks before saving, A2).
 *  Full at step 0; from step 1 a one-line summary that opens on demand (C3). The reference stays editable until the
 *  call is saved: only the save uses it (ORDERREF). It is required: no result is recorded without it. */
/** The words under the dossier field for the EcoManager check of this reference (null: nothing checked yet). */
export function orderCheckText(check:OrderCheck|null):string|null{
 if(!check)return null;
 if(check.status==='checking')return 'Vérification dans EcoManager…';
 if(check.status==='verified'&&check.order)return `Commande vérifiée · ${check.order.stateLabel}${check.order.stateName?` (${check.order.stateName})`:''}`;
 if(check.status==='unavailable')return 'EcoManager ne répond pas : la commande sera marquée « à vérifier ».';
 if(check.status==='not-found'||check.status==='invalid')return check.message||null;
 return null;
}

export function CallContextPanel(){const {step,demo,saved,busy,orderRef,setOrderRef,orderRefAsked,orderCheck,checkOrder,customerStage,setCustomerStage,linkedCallId,base,presented,record}=useCall();
 const ref=normalizeOrderReference(orderRef),check=orderCheck&&(orderCheck.reference===ref||orderCheck.order?.reference===ref)?orderCheck:null;
 const checkText=orderCheckText(check),checkError=check?.status==='not-found'||check?.status==='invalid';
 const inputs=<>
  <label htmlFor="call-order-ref"><span>Référence du dossier <span className="field-required">(obligatoire)</span></span><input id="call-order-ref" value={orderRef} onChange={e=>setOrderRef(e.target.value.replace(/[^A-Za-z0-9._#-]/g,'').toUpperCase())} onBlur={()=>{if(orderCheck&&orderRef.trim())checkOrder();}} onKeyDown={e=>{if(e.key==='Enter'&&orderCheck){e.preventDefault();checkOrder();}}} maxLength={60} placeholder={orderCheck?'TOU1763816':'DOS-0142'} disabled={saved} required aria-required="true" aria-invalid={orderRefAsked||checkError||undefined} aria-describedby="call-order-ref-help"/><small id="call-order-ref-help" className={orderRefAsked||checkError?'field__error':checkText&&check?.status==='verified'?'field__help call-context__verified':'field__help'} aria-live="polite">{orderRefAsked?'Renseignez la référence du dossier pour enregistrer le résultat.':checkText||'Obligatoire pour enregistrer le résultat de l’appel.'}</small></label>
  <label htmlFor="call-customer-stage"><span>Parcours d’achat déclaré</span><select id="call-customer-stage" value={customerStage} onChange={e=>setCustomerStage(e.target.value)} disabled={saved}>{Object.entries(STAGES).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
 </>;
 const unreachable=base&&<button type="button" className="btn btn--secondary call-context__action" disabled={busy||saved||demo||presented.length>0} onClick={()=>record('noanswer')}>Cliente non jointe</button>;
 const linked=linkedCallId&&<p className="call-context__linked">Nouvel appel lié au précédent : <span className="num">{linkedCallId.slice(0,8)}</span></p>;
 if(step>0)return <section className="call-context call-context--compact" aria-labelledby="call-context-heading">
  <details className="call-context__details">
   <summary><h2 id="call-context-heading" className="call-context__title">Contexte de l’appel</h2><span className="call-context__summary">{orderRef?<>Dossier <span className="num">{orderRef}</span>{check?.status==='verified'&&check.order?<> · {check.order.stateLabel}</>:checkError?<span className="call-context__missing"> · introuvable dans EcoManager</span>:null}</>:<span className="call-context__missing">Référence du dossier à renseigner</span>} · {customerStage!=='unknown'&&STAGES[customerStage]?STAGES[customerStage]:'Parcours non renseigné'}</span></summary>
   <div className="call-context__body"><p className="call-context__note">Pour le pilotage. Aucun nom, téléphone ou renseignement médical.</p><div className="call-context__fields">{inputs}</div>{linked}</div>
  </details>
  {unreachable}
 </section>;
 return <section className="call-context" aria-labelledby="call-context-heading">
  <div className="call-context__intro"><h2 id="call-context-heading" className="call-context__title">Contexte de l’appel</h2><p>Pour le pilotage. Aucun nom, téléphone ou renseignement médical.</p></div>
  <div className="call-context__fields">{inputs}{unreachable}</div>
  {linked}
 </section>;
}
