import {useId} from 'react';
import {cataloguePath,SKINS,HAIR_TYPES,type Product,concernLabel} from '@touche/domain';
import {Icon} from '../shared/Icon';
import {useCall} from './callModel';
import {AdviceStatus} from './AdviceStatus';
import {SalesCoach} from './SalesCoach';
import {PackUpgrades} from './PackUpgrades';
import {ProductPicker} from './ProductPicker';
import {SpecificChecks} from './SpecificChecks';
import {OfferPresentation} from './OfferPresentation';
import {OfferTotals} from './OfferTotals';
import {OfferBar} from './OfferBar';
import {CallClose} from './CallClose';
import {SavedPanel} from './SavedPanel';

/** Step 03 · Routine & offre: product path, targeted check or the routine builder, sales coach, offers and closing. The
 *  saved outcome shows right after the close-out here (not at the top of the call), where the button was pressed. */
export function StepRoutine({base}:{base:Product}){const {toStep,saved,products,initial,domain,profile,changeProfile,blocked,notes,candidates,basket,altered,tier,copy}=useCall();
 const path=cataloguePath(base,products);
 return <>
 <section className="card call-path" aria-labelledby="call-path-title"><h2 id="call-path-title">Le parcours de {base.short}</h2><p>{path.purpose}</p>{path.checks.map(c=><p className="call-path__check" key={c}><Icon name="info"/>{c}</p>)}{domain==='hair'&&profile.concerns.includes('flakes')&&<label className="check-row"><input type="checkbox" checked={!!profile.scalpProtocol} disabled={saved} onChange={e=>changeProfile({scalpProtocol:e.target.checked})}/>Une routine spécifique a déjà été vérifiée par le référent de l’équipe, pour cette situation et cet âge.</label>}</section>

 <div className="call-summary"><dl className="call-summary__facts"><div><dt>Priorité</dt><dd>{profile.concerns[0]?concernLabel(profile.concerns[0],base):''}</dd></div><div><dt>{domain==='hair'?'Cheveux':'Peau'}</dt><dd>{(domain==='hair'?HAIR_TYPES:SKINS).find(s=>s[0]===profile.skin)?.[1]}</dd></div></dl><button type="button" className="link-btn" onClick={()=>toStep(1)}>{saved?'Voir les réponses':'Modifier les réponses'}</button></div>
 {blocked?<ReviewStopPanel/>:<>
  <AdviceStatus blocked={null} notes={notes}/>
  <PackUpgrades base={base}/>
  {!blocked&&<ProductPicker/>}
 <SpecificChecks/>
  {(altered||candidates.length>0)&&<SalesCoach base={base} initial={initial} basket={altered?basket:(candidates[0]?[...basket,candidates[0].product]:basket)} profile={profile} tier={tier} catalogue={products} copy={copy} preview={!altered&&!!candidates.length}/>}
  {/* Under 1024px the rail drops below the call: price, total and copy come here, before the presentation (C1). */}
  <section className="card call-offer" aria-labelledby="call-offer-title"><h2 id="call-offer-title">Prix et récapitulatif</h2><OfferTotals/></section>
 <OfferPresentation/>
 <CallClose/>
 <SavedPanel/>
 <OfferBar/>
 </>}
 </>;
}

/**
 * The targeted stop: the reason, then the words for that exact reason (MEDSCRIPT); an urgent reaction uses the danger tone.
 * Besides « Enregistrer l’orientation », a callback can be scheduled; when the script promises one, it is the suggested
 * outcome (MEDCB). That callback is recorded as the orientation (« review ») with its callback date, so the call counts as a
 * targeted check and still appears in the reminders (recording-2). Calls saved before keep their « callback » outcome.
 */
function ReviewStopPanel(){const {stop,blocked,busy,saved,savedOutcome,demo,callbackAt,setCallbackAt,record}=useCall();
 const dateId=useId(),helpId=useId();
 if(!stop||!blocked)return null;
 const urgent=stop.urgent,suggest=stop.followUp;
 // A saved call keeps its callback date only when it was sent with the result.
 const scheduled=saved&&(savedOutcome==='callback'||(savedOutcome==='review'&&!!callbackAt));
 const orientation=<button type="button" className={`btn ${suggest?'btn--secondary':'btn--primary'}`} disabled={busy||saved} onClick={()=>record('review')}>{saved&&savedOutcome==='review'&&!scheduled?'Orientation enregistrée':suggest?'Enregistrer l’orientation sans rappel':'Enregistrer l’orientation'}<Icon name="check"/></button>;
 const callback=<div className="call-stop__callback">
  <div className="field"><label className="field__label" htmlFor={dateId}>{suggest?'Date du rappel promis':'Rappel (facultatif)'}</label><input id={dateId} type="datetime-local" value={callbackAt} disabled={saved} aria-describedby={helpId} onChange={e=>setCallbackAt(e.target.value)}/><p id={helpId} className="field__help">Heure d’Alger. Il apparaîtra dans vos rappels.</p></div>
  <button type="button" className={`btn ${suggest?'btn--primary':'btn--secondary'}`} disabled={busy||saved||demo||!callbackAt} onClick={()=>record('review',{callback:true})}>{scheduled?'Rappel programmé':'Programmer un rappel'}<Icon name="clock"/></button>
 </div>;
 return <section className={`notice ${urgent?'notice--danger':'notice--warning'} call-stop`} data-urgent={urgent||undefined} aria-labelledby="call-stop-title"><Icon name="alert" className="notice__icon"/><div className="notice__text">
  <h2 id="call-stop-title" className="call-stop__title">{urgent?'Urgence possible : arrêtez la proposition.':'Vérifions ce point avant de proposer.'}</h2>
  <p className="call-stop__reason">{stop.text}</p>
  <div className="call-stop__say"><p className="call-stop__say-label">À dire à la cliente</p><p className="call-say">{stop.script}</p></div>
  {suggest
   ?<><p className="call-stop__hint">Ce message annonce un rappel : programmez-le pour qu’il apparaisse dans vos rappels.</p>{callback}<div>{orientation}</div></>
   :<><div>{orientation}</div><details className="call-stop__later"><summary>Programmer un rappel</summary>{callback}</details></>}
 </div></section>;
}
