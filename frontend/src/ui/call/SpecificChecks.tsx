import {domainOf} from '@touche/domain';
import {useCall} from './callModel';

/** Step 03 · references that need a specific label and protocol check. Ticking clears nothing; unticking removes only the
 *  additions that needed that check, with « Annuler » (SPEC). */
export function SpecificChecks(){const {saved,products,domain,verifiedProducts,toggleVerified,setDetail}=useCall();
 return <details className="card call-checks"><summary>Références à vérification spécifique</summary><p className="call-checks__note">Ces références ont un parcours, mais nécessitent une vérification réelle de l’étiquette et du protocole. Cette confirmation ne désactive pas les alertes ni le contrôle des doublons.</p><ul className="call-checks__list" role="list">{products.filter(p=>p.enabled&&domainOf(p)===domain&&p.verificationRequired&&p.id!=='packjunior').map(p=><li className="call-checks__item" key={p.id}><label className="check-row"><input type="checkbox" checked={verifiedProducts.includes(p.id)} disabled={saved} onChange={e=>toggleVerified(p,e.target.checked)}/><span><b>{p.short}</b><p>{p.verificationRequired}</p></span></label><button type="button" className="link-btn link-btn--sm" aria-label={'Voir la fiche de '+p.name} onClick={()=>setDetail(p)}>Voir la fiche</button></li>)}</ul></details>;
}
