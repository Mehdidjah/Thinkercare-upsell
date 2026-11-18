import {quantityOf,expand,money,type Product} from '@touche/domain';
import {Photo} from '../shared/Photo';
import {useCall} from './callModel';

/** Step 03 · official pack replacing the initial product. */
export function PackUpgrades({base}:{base:Product}){const {products,initial,upgrades,upgrade,setUpgradeId,setAdds,clearRequests,setConsent,setChecked}=useCall();
 return <>
  {upgrades.length>0&&<section className="pack-upgrades"><div className="section-head"><div><h2>Passer au pack officiel</h2><p className="muted">Remplace le produit initial. Il n’est jamais facturé deux fois.</p></div></div>{upgrades.map(r=><div className="pack-upgrade" key={r.product.id}><Photo product={r.product} small/><div><h3>{r.product.name}</h3><p>{r.reason}</p><small>{expand(r.product,products).map(x=>x.short).join(' + ')}</small><b>{quantityOf(initial[0])} × {money(r.product.price)} · écart {money((r.product.price-base.price)*quantityOf(initial[0]))}</b><button className="outline" onClick={()=>{setUpgradeId(r.product.id);setAdds([]);clearRequests();setConsent(false);setChecked(false);}}>Remplacer par ce pack</button></div></div>)}<small>Le tarif pack est conservé. Vous pouvez aussi comparer avec un duo de produits séparés bénéficiant de l’offre autorisée.</small></section>}
  {upgrade&&<div className="upgrade-active"><b>Pack retenu : {upgrade.name}</b><span>Remplace {base.short} ; calcul du supplément sur la commande initiale.</span><button className="text-button" onClick={()=>{setUpgradeId('');setAdds([]);clearRequests();setConsent(false);setChecked(false);}}>Revenir aux produits séparés</button></div>}
 </>;
}
