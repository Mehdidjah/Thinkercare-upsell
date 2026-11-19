import {quantityOf,expand,money,type Product} from '@touche/domain';
import {Photo} from '../shared/Photo';
import {useCall} from './callModel';

/** Step 03 · official pack replacing the initial product. */
export function PackUpgrades({base}:{base:Product}){const {saved,products,initial,upgrades,upgrade,chooseUpgrade,clearUpgrade}=useCall();
 return <>
  {upgrades.length>0&&<section className="card call-packs" aria-labelledby="call-packs-title"><div className="section-head"><div><h2 id="call-packs-title">Passer au pack officiel</h2><p>Remplace le produit initial. Il n’est jamais facturé deux fois.</p></div></div>
   <ul className="call-packs__list" role="list">{upgrades.map(r=><li className="call-pack" key={r.product.id}><Photo product={r.product} small/><div className="call-pack__body"><h3 className="call-pack__name">{r.product.name}</h3><p className="call-pack__reason">{r.reason}</p><p className="call-pack__meta">{expand(r.product,products).map(x=>x.short).join(' + ')}</p><p className="call-pack__price"><span className="num">{quantityOf(initial[0])} × {money(r.product.price)}</span>, écart <span className="num">{money((r.product.price-base.price)*quantityOf(initial[0]))}</span></p></div><button type="button" className="btn btn--secondary btn--sm" disabled={saved} onClick={()=>chooseUpgrade(r.product.id)}>Remplacer par ce pack</button></li>)}</ul>
   <p className="footnote">Le tarif pack est conservé. Vous pouvez aussi comparer avec un duo de produits séparés bénéficiant de l’offre autorisée.</p></section>}
  {upgrade&&<div className="notice notice--info call-pack-active"><div className="notice__text"><p className="notice__title">Pack retenu : {upgrade.name}</p><p>Remplace {base.short} ; calcul du supplément sur la commande initiale.</p></div><button type="button" className="btn btn--secondary btn--sm" disabled={saved} onClick={clearUpgrade}>Revenir aux produits séparés</button></div>}
 </>;
}
