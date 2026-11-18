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
 return <>
 <div className="coverage-card"><h3>Le parcours de {base.short}</h3><p>{cataloguePath(base,products).purpose}</p>{cataloguePath(base,products).checks.map(c=><p className="coverage-note" key={c}>{c}</p>)}{domain==='hair'&&profile.concerns.includes('flakes')&&<label className="check-row"><input type="checkbox" checked={!!profile.scalpProtocol} onChange={e=>changeProfile({scalpProtocol:e.target.checked})}/>Une routine spécifique a déjà été vérifiée par le référent de l’équipe, pour cette situation et cet âge.</label>}</div>

 <div className="profile-strip"><b>{CONCERNS.find(c=>c[0]===profile.concerns[0])?.[1]}</b><span>{domain==='hair'?'Cheveux : ':'Peau : '}{(domain==='hair'?HAIR_TYPES:SKINS).find(s=>s[0]===profile.skin)?.[1].toLowerCase()}</span><button onClick={()=>toStep(1)}>Modifier les réponses</button></div>
 {blocked?<div className="medical-stop"><span className="large-icon"><Icon name="shield" size={32}/></span><h2>Vérifions ce point avant de proposer.</h2><p>{blocked}</p><div className="say-box"><span>À DIRE À LA CLIENTE</span><p>« Pour vous conseiller correctement, je préfère faire vérifier votre situation par notre encadrement médical avant de compléter votre commande sur la zone concernée. »</p></div><button className="primary" disabled={busy||saved} onClick={()=>record('review')}>{saved?'Orientation enregistrée':'Enregistrer l’orientation'}<Icon name="check"/></button></div>:<>
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
