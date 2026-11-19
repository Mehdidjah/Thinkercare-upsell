import {domainOf} from '@touche/domain';
import {useCall} from './callModel';

/** Step 03 · references that need a specific label and protocol check. */
export function SpecificChecks(){const {products,domain,setUpgradeId,setAdds,clearRequests,verifiedProducts,setVerifiedProducts,setDetail,setConsent,setChecked}=useCall();
 return <details className="card call-checks"><summary>Références à vérification spécifique</summary><p className="call-checks__note">Ces références ont un parcours, mais nécessitent une vérification réelle de l’étiquette et du protocole. Cette confirmation ne désactive pas les alertes ni le contrôle des doublons.</p><ul className="call-checks__list" role="list">{products.filter(p=>p.enabled&&domainOf(p)===domain&&p.verificationRequired&&p.id!=='packjunior').map(p=><li className="call-checks__item" key={p.id}><label className="check-row"><input type="checkbox" checked={verifiedProducts.includes(p.id)} onChange={e=>{const ids=p.category==='Pack'?[p.id,...(p.components||[])]:[p.id];setVerifiedProducts(a=>e.target.checked?[...new Set([...a,...ids])]:a.filter(x=>!ids.includes(x)));setAdds([]);clearRequests();setUpgradeId('');setConsent(false);setChecked(false);}}/><span><b>{p.short}</b><p>{p.verificationRequired}</p></span></label><button type="button" className="link-btn link-btn--sm" onClick={()=>setDetail(p)}>Fiche</button></li>)}</ul></details>;
}
