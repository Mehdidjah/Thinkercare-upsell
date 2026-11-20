import {useId} from 'react';
import {money} from '@touche/domain';
import {Button} from '../shared/Button';
import {DisabledReason} from '../shared/DisabledReason';
import {Icon} from '../shared/Icon';
import {useCall} from './callModel';

/** Step 03 · closing the call: accepted routine, initial order kept, callback, refusal. « Conserver » and « Cliente non
 *  jointe » ask first (A2); the saved outcome shows in SavedPanel at every step. The accepted sale and the refusal stay
 *  focusable while they wait for something, and say what is missing (B3, M5, REFUSE). When the server keeps the presented
 *  price, the accepted sale says the amount it records: the presented one, even if the catalogue changed since. */
export function CallClose(){const {demo,orderRef,saved,busy,toStep,count,altered,presented,matchingOffer,keepsPresentedPrice,offer,offerIssue,consent,setConsent,checked,setChecked,callbackAt,setCallbackAt,refusal,setRefusal,record}=useCall();
 const callbackId=useId(),refusalId=useId(),refusalHelpId=useId(),acceptReasonId=useId();
 const refMissing=!orderRef.trim(),acceptMissing=!matchingOffer||!checked||!consent||!!offerIssue||refMissing,acceptable=!saved&&!demo;
 const offered=presented.length>0,refusalBlocked=!offered||!refusal;
 return <section className="card call-close" aria-labelledby="call-close-title">
  <div className="section-head"><div><h2 id="call-close-title" tabIndex={-1}>Clôturer l’appel</h2><p>Enregistrez le résultat annoncé, pas un chiffre d’affaires encaissé. La commande doit être mise à jour séparément dans votre système.</p>{!saved&&<button type="button" className="link-btn" disabled={busy} onClick={()=>toStep(1)}><Icon name="back" size={16}/>Besoin de la cliente</button>}</div></div>
  {altered&&<div className="call-close__accept"><div className="call-close__checks"><label className="check-row"><input type="checkbox" checked={checked} disabled={saved} onChange={e=>setChecked(e.target.checked)}/>Compatibilité vérifiée avec le protocole interne et l’encadrement si nécessaire.</label><label className="check-row"><input type="checkbox" checked={consent} disabled={saved} onChange={e=>setConsent(e.target.checked)}/>La cliente a donné son accord explicite pour les produits et le prix annoncés.</label></div>
   <div className="action-with-reason">
    <Button variant="primary" size="lg" className="call-close__accept-btn" disabled={!acceptable||busy} blocked={acceptable&&acceptMissing} reasonId={acceptReasonId} onClick={()=>void record(count===2?'duo':count===3?'trio':'routine')}>{saved?'Résultat enregistré':`Enregistrer ${count===2?'le duo accepté':count===3?'le trio accepté':'la routine acceptée'}`}<Icon name="check"/></Button>
    {acceptable&&acceptMissing&&<DisabledReason id={acceptReasonId} title="Pour enregistrer l’accord :" items={offerIssue?[{label:offerIssue,done:false}]:[{label:'Renseignez la référence du dossier',done:!refMissing},{label:'Présentez cette offre',done:!!matchingOffer},{label:'Cochez la compatibilité',done:checked},{label:'Cochez l’accord de la cliente',done:consent}]}/>}
   </div>
   {acceptable&&keepsPresentedPrice&&matchingOffer&&<p className="call-close__price">Accord enregistré au prix présenté : <b className="num">{money(matchingOffer.offerTotal)}</b>{matchingOffer.offerTotal!==offer&&<>. Le catalogue indique maintenant <span className="num">{money(offer)}</span> : le prix annoncé à la cliente reste celui de l’offre présentée</>}.</p>}
  </div>}
  <div className="call-close__outcomes"><button type="button" className="btn btn--secondary" disabled={saved||busy||demo} onClick={()=>record('initial')}>Conserver la commande initiale</button><button type="button" className="btn btn--ghost" disabled={saved||busy||demo} onClick={()=>record('noanswer')}>Cliente non jointe</button></div>
  <div className="call-close__row"><div className="field"><label className="field__label" htmlFor={callbackId}>Programmer un rappel</label><input id={callbackId} type="datetime-local" value={callbackAt} onChange={e=>setCallbackAt(e.target.value)} disabled={saved}/><p className="field__help">Heure d’Alger</p></div><button type="button" className="btn btn--secondary" disabled={saved||busy||demo||!callbackAt} onClick={()=>record('callback')}>Enregistrer le rappel</button></div>
  <div className="call-close__row"><div className="field"><label className="field__label" htmlFor={refusalId}>Motif du refus d’ajout</label><select id={refusalId} value={refusal} disabled={saved||!offered} aria-describedby={refusalHelpId} onChange={e=>setRefusal(e.target.value)}><option value="">Choisir un motif</option><option value="budget">Budget</option><option value="already">Déjà équipée</option><option value="uninterested">Pas intéressée</option><option value="later">Plus tard</option><option value="efficacy">Doute sur le résultat</option><option value="reaction">Tolérance</option><option value="many">Trop de produits</option><option value="discount">Remise</option><option value="other">Autre</option></select><p id={refusalHelpId} className="field__help">{offered?'Choisissez le motif donné par la cliente.':'Disponible après une offre présentée : cliquez d’abord sur « J’ai présenté ».'}</p></div><Button disabled={saved||demo||busy} blocked={!saved&&!demo&&refusalBlocked} reasonId={refusalHelpId} onClick={()=>void record('refused')}>Enregistrer le refus</Button></div>
  {demo&&<p className="notice notice--info"><Icon name="info" className="notice__icon"/><span className="notice__text">Mode exemple : l’enregistrement est désactivé.</span></p>}
 </section>;
}
