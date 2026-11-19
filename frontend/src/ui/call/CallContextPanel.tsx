import {STAGES} from '@touche/domain';
import {useCall} from './callModel';

/** Call context: file reference, declared purchase stage, unreachable customer (asks before saving, A2).
 *  Full at step 0; from step 1 a one-line summary that opens on demand (C3). The reference stays editable until the
 *  call is saved: only the save uses it (ORDERREF). */
export function CallContextPanel(){const {step,demo,saved,busy,orderRef,setOrderRef,customerStage,setCustomerStage,linkedCallId,base,presented,record}=useCall();
 const inputs=<>
  <label htmlFor="call-order-ref"><span>Référence du dossier <span className="field-optional">(facultatif)</span></span><input id="call-order-ref" value={orderRef} onChange={e=>setOrderRef(e.target.value.replace(/[^A-Za-z0-9._#-]/g,'').toUpperCase())} maxLength={60} placeholder="DOS-0142" disabled={saved}/></label>
  <label htmlFor="call-customer-stage"><span>Parcours d’achat déclaré</span><select id="call-customer-stage" value={customerStage} onChange={e=>setCustomerStage(e.target.value)} disabled={saved}>{Object.entries(STAGES).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
 </>;
 const unreachable=base&&<button type="button" className="btn btn--secondary call-context__action" disabled={busy||saved||demo||presented.length>0} onClick={()=>record('noanswer')}>Cliente non jointe</button>;
 const linked=linkedCallId&&<p className="call-context__linked">Nouvel appel lié au précédent : <span className="num">{linkedCallId.slice(0,8)}</span></p>;
 if(step>0)return <section className="call-context call-context--compact" aria-labelledby="call-context-heading">
  <details className="call-context__details">
   <summary><h2 id="call-context-heading" className="call-context__title">Contexte de l’appel</h2><span className="call-context__summary">{orderRef?<>Dossier <span className="num">{orderRef}</span></>:'Sans référence de dossier'} · {customerStage!=='unknown'&&STAGES[customerStage]?STAGES[customerStage]:'Parcours non renseigné'}</span></summary>
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
