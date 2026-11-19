import {cataloguePath,CONCERNS,SKINS,HAIR_TYPES,type Product} from '@touche/domain';
import {Icon} from '../shared/Icon';
import {useCall} from './callModel';
import {AdviceStatus} from './AdviceStatus';
import {SalesCoach} from './SalesCoach';
import {PackUpgrades} from './PackUpgrades';
import {ProductPicker} from './ProductPicker';
import {SpecificChecks} from './SpecificChecks';
import {OfferPresentation} from './OfferPresentation';
import {CallClose} from './CallClose';

/** Step 03 · Routine & offre: product path, targeted check or the routine builder, sales coach, offers and closing. */
export function StepRoutine({base}:{base:Product}){const {toStep,saved,busy,products,initial,domain,profile,changeProfile,blocked,notes,candidates,basket,altered,tier,copy,record}=useCall();
 const path=cataloguePath(base,products);
 return <>
 <section className="card call-path" aria-labelledby="call-path-title"><h2 id="call-path-title">Le parcours de {base.short}</h2><p>{path.purpose}</p>{path.checks.map(c=><p className="call-path__check" key={c}><Icon name="info"/>{c}</p>)}{domain==='hair'&&profile.concerns.includes('flakes')&&<label className="check-row"><input type="checkbox" checked={!!profile.scalpProtocol} onChange={e=>changeProfile({scalpProtocol:e.target.checked})}/>Une routine spécifique a déjà été vérifiée par le référent de l’équipe, pour cette situation et cet âge.</label>}</section>

 <div className="call-summary"><dl className="call-summary__facts"><div><dt>Priorité</dt><dd>{CONCERNS.find(c=>c[0]===profile.concerns[0])?.[1]}</dd></div><div><dt>{domain==='hair'?'Cheveux':'Peau'}</dt><dd>{(domain==='hair'?HAIR_TYPES:SKINS).find(s=>s[0]===profile.skin)?.[1]}</dd></div></dl><button type="button" className="link-btn" onClick={()=>toStep(1)}>Modifier les réponses</button></div>
 {blocked?<section className="notice notice--warning call-stop" aria-labelledby="call-stop-title"><Icon name="alert" className="notice__icon"/><div className="notice__text"><h2 id="call-stop-title" className="call-stop__title">Vérifions ce point avant de proposer.</h2><p className="call-stop__reason">{blocked}</p><div className="call-stop__say"><p className="call-stop__say-label">À dire à la cliente</p><p className="call-say">« Pour vous conseiller correctement, je préfère faire vérifier votre situation par notre encadrement médical avant de compléter votre commande sur la zone concernée. »</p></div><div><button type="button" className="btn btn--primary" disabled={busy||saved} onClick={()=>record('review')}>{saved?'Orientation enregistrée':'Enregistrer l’orientation'}<Icon name="check"/></button></div></div></section>:<>
  <AdviceStatus blocked={null} notes={notes}/>
  <PackUpgrades base={base}/>
  {!blocked&&<ProductPicker/>}
 <SpecificChecks/>
  {(altered||candidates.length>0)&&<SalesCoach base={base} initial={initial} basket={altered?basket:(candidates[0]?[...basket,candidates[0].product]:basket)} profile={profile} tier={tier} catalogue={products} copy={copy} preview={!altered&&!!candidates.length}/>}
 <OfferPresentation/>
 <CallClose/>
 </>}
 </>;
}
