import {money} from '@touche/domain';
import {Icon} from '../shared/Icon';
import {Photo} from '../shared/Photo';
import {useCall} from './callModel';

/** Step 03 · one list for suggested and customer-requested products, with compatibility checks. */
export function ProductPicker(){const {saved,setDetail,candidates,requests,requestSearch,setRequestSearch,confirmId,setConfirmId,addComplement,count}=useCall();
 return <section className="card call-picker" aria-labelledby="product-picker-heading">
   <div className="section-head"><div><h2 id="product-picker-heading">Ajouter un produit à la routine</h2><p>Les produits suggérés apparaissent en premier. Retrouvez aussi un produit demandé par la cliente dans cette même liste.</p></div><span className="counter">{count} unité{count>1?'s':''}</span></div>
   <div className="search-field"><Icon name="search"/><input type="search" aria-label="Rechercher un produit à ajouter" placeholder="Ex. crème solaire, shampoing" value={requestSearch} onChange={e=>{setRequestSearch(e.target.value);setConfirmId('');}}/></div>
   {!candidates.length&&!requestSearch&&<p className="notice notice--plain call-picker__notice"><Icon name="info" className="notice__icon"/><span className="notice__text">Aucune suggestion adaptée pour le moment. Vous pouvez rechercher un produit demandé par la cliente et vérifier sa compatibilité.</span></p>}
   <div className="call-picker__list" role="region" aria-label="Produits à ajouter" tabIndex={0}>{requests.length?<ul className="call-picker__rows" role="list">{requests.map(({product:p,check:chk,suggestion})=>{
    const needsConfirmation=!suggestion&&chk.warnings.length>0,confirming=needsConfirmation&&confirmId===p.id;
    return <li key={p.id} className="call-product" data-state={chk.blocked?'blocked':confirming?'check':suggestion?'suggested':'default'}>
     <Photo product={p} small/>
     <div className="call-product__main">
      <div className="call-product__title"><h3 className="call-product__name">{p.name}</h3>{suggestion&&<span className="tag tag--neutral"><Icon name="spark"/>Suggéré</span>}{!chk.blocked&&needsConfirmation&&<span className="tag tag--warning"><Icon name="alert"/>À vérifier</span>}</div>
      <p className="call-product__meta">{p.category}, {p.size}</p>
      {suggestion&&<p className="call-product__reason">{suggestion.reason}</p>}
      {chk.blocked&&<p className="call-product__blocked"><Icon name="lock"/>{chk.blocked}</p>}
      <button type="button" className="link-btn link-btn--sm" onClick={()=>setDetail(p)}>Ingrédients & argumentaire</button>
     </div>
     <div className="call-product__side"><span className="call-product__price num">{money(p.price)}</span>
      {!chk.blocked&&<button type="button" className="btn btn--secondary btn--sm" disabled={saved} aria-label={'Ajouter '+p.name} aria-expanded={needsConfirmation?confirmId===p.id:undefined} aria-controls={needsConfirmation?'request-confirm-'+p.id:undefined} onClick={()=>needsConfirmation?setConfirmId(p.id):addComplement(p.id,chk.verifyIds,!suggestion)}><Icon name="plus"/>Ajouter</button>}
     </div>
     {!chk.blocked&&needsConfirmation&&confirmId===p.id&&<div className="call-product__confirm" id={'request-confirm-'+p.id} role="group" aria-label={'Avant d’ajouter '+p.name}><p className="call-product__confirm-title"><Icon name="alert"/>À vérifier avant l’ajout</p><ul className="call-product__warnings">{chk.warnings.map(w=><li key={w}>{w}</li>)}</ul><div className="call-product__confirm-actions"><button type="button" className="btn btn--primary btn--sm" disabled={saved} onClick={()=>addComplement(p.id,chk.verifyIds,true)}>Confirmer : la cliente le demande, compatibilité vérifiée</button><button type="button" className="btn btn--ghost btn--sm" onClick={()=>setConfirmId('')}>Annuler</button></div></div>}
    </li>;
   })}</ul>:<div className="empty"><Icon name="search"/><p className="empty__title">{requestSearch?'Aucun produit ne correspond à cette recherche.':'Aucune autre référence disponible.'}</p>{requestSearch&&<button type="button" className="btn btn--secondary btn--sm" onClick={()=>{setRequestSearch('');setConfirmId('');}}>Effacer la recherche</button>}</div>}</div>
   <p className="footnote">Pour plusieurs unités d’un même produit, ajustez sa quantité dans « Votre routine ». Les vérifications de compatibilité et les alertes restent appliquées.</p>
  </section>;
}
