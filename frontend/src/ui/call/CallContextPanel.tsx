import {STAGES} from '@touche/domain';
import {useCall} from './callModel';

/** Call context: file reference, declared purchase stage, unreachable customer. */
export function CallContextPanel(){const {demo,saved,busy,orderRef,setOrderRef,customerStage,setCustomerStage,linkedCallId,base,presented,record}=useCall();
 return <section className="call-context" aria-labelledby="call-context-heading">
  <div className="call-context__intro"><h2 id="call-context-heading" className="call-context__title">Contexte de l’appel</h2><p>Pour le pilotage. Aucun nom, téléphone ou renseignement médical.</p></div>
  <div className="call-context__fields">
   <label htmlFor="call-order-ref"><span>Référence du dossier <span className="field-optional">(facultatif)</span></span><input id="call-order-ref" value={orderRef} onChange={e=>setOrderRef(e.target.value.replace(/[^A-Za-z0-9._#-]/g,'').toUpperCase())} maxLength={60} placeholder="DOS-0142" disabled={saved||presented.length>0}/></label>
   <label htmlFor="call-customer-stage"><span>Parcours d’achat déclaré</span><select id="call-customer-stage" value={customerStage} onChange={e=>setCustomerStage(e.target.value)} disabled={saved}>{Object.entries(STAGES).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
   {base&&<button type="button" className="btn btn--secondary call-context__action" disabled={busy||saved||demo||presented.length>0} onClick={()=>record('noanswer')}>Cliente non jointe</button>}
  </div>
  {linkedCallId&&<p className="call-context__linked">Nouvel appel lié au précédent : <span className="num">{linkedCallId.slice(0,8)}</span></p>}
 </section>;
}
