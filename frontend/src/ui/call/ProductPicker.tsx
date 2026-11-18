import {money} from '@touche/domain';
import {Icon} from '../shared/Icon';
import {Photo} from '../shared/Photo';
import {useCall} from './callModel';

/** Step 03 · one list for suggested and customer-requested products, with compatibility checks. */
export function ProductPicker(){const {saved,setDetail,candidates,requests,requestSearch,setRequestSearch,confirmId,setConfirmId,addComplement,count}=useCall();
 return <section className="product-picker" aria-labelledby="product-picker-heading">
   <div className="section-head"><div><h2 id="product-picker-heading">Ajouter un produit à la routine</h2><p className="muted">Les produits suggérés apparaissent en premier. Retrouvez aussi un produit demandé par la cliente dans cette même liste.</p></div><span className="counter">{count} unité{count>1?'s':''}</span></div>
   <div className="search-field"><Icon name="search"/><input aria-label="Rechercher un produit à ajouter" placeholder="Rechercher un produit du catalogue…" value={requestSearch} onChange={e=>{setRequestSearch(e.target.value);setConfirmId('');}}/></div>
   {!candidates.length&&!requestSearch&&<p className="picker-notice">Aucune suggestion adaptée pour le moment. Vous pouvez rechercher un produit demandé par la cliente et vérifier sa compatibilité.</p>}
   <div className="request-scroll" role="region" aria-label="Produits à ajouter" tabIndex={0}>{requests.length?<ul className="request-list">{requests.map(({product:p,check:chk,suggestion})=>{
    const needsConfirmation=!suggestion&&chk.warnings.length>0;
    return <li key={p.id} className={'request-row'+(suggestion?' suggested':'')+(chk.blocked?' blocked':'')}>
     <Photo product={p} small/>
     <div className="request-info"><div className="request-title"><h3>{p.name}</h3>{suggestion&&<span className="request-tag">Suggéré</span>}</div><small>{p.category} · {p.size}</small>{suggestion&&<p className="request-description">{suggestion.reason}</p>}{chk.blocked&&<p className="request-reason">{chk.blocked}</p>}<button type="button" className="text-button request-details" onClick={()=>setDetail(p)}>Ingrédients & argumentaire</button></div>
     <b className="request-price">{money(p.price)}</b>
     {!chk.blocked&&<button type="button" className="add-product" disabled={saved} aria-label={'Ajouter '+p.name} aria-expanded={needsConfirmation?confirmId===p.id:undefined} aria-controls={needsConfirmation?'request-confirm-'+p.id:undefined} onClick={()=>needsConfirmation?setConfirmId(p.id):addComplement(p.id,chk.verifyIds,!suggestion)}><Icon name="plus" size={16}/>Ajouter</button>}
     {!chk.blocked&&needsConfirmation&&confirmId===p.id&&<div className="request-confirm" id={'request-confirm-'+p.id} role="group" aria-label={'Avant d’ajouter '+p.name}><b>À vérifier avant l’ajout</b><ul>{chk.warnings.map(w=><li key={w}>{w}</li>)}</ul><div className="request-confirm-actions"><button type="button" className="primary" disabled={saved} onClick={()=>addComplement(p.id,chk.verifyIds,true)}>Confirmer : la cliente le demande, compatibilité vérifiée</button><button type="button" className="text-button" onClick={()=>setConfirmId('')}>Annuler</button></div></div>}
    </li>;
   })}</ul>:<div className="request-empty"><p>{requestSearch?'Aucun produit ne correspond à cette recherche.':'Aucune autre référence disponible.'}</p>{requestSearch&&<button type="button" className="text-button" onClick={()=>{setRequestSearch('');setConfirmId('');}}>Effacer la recherche</button>}</div>}</div>
   <p className="picker-footnote">Pour plusieurs unités d’un même produit, ajustez sa quantité dans « Votre routine ». Les vérifications de compatibilité et les alertes restent appliquées.</p>
  </section>;
}
