import {quantityOf,lineTotal,isPack,expand,money} from '@touche/domain';
import QuantityControl from '../QuantityControl';
import {Icon} from '../shared/Icon';
import {Photo} from '../shared/Photo';
import {CATS} from '../shared/catalogue';
import {useCall} from './callModel';

/** Step 01 · Commande initiale: pick every product of the initial order. */
export function StepOrder(){const {toStep,saved,busy,presenting,products,visible,search,setSearch,scope,setScope,category,setCategory,baseId,baseIds,base,initial,baseTotal,changeInitial,changeInitialQuantity,presented}=useCall();
 const locked=saved||presented.length>0;
 return <>
  <section className="card call-order" aria-labelledby="call-order-title">
   <div className="section-head"><div><h2 id="call-order-title">Quels produits a-t-elle commandés ?</h2><p>Sélectionnez chaque produit de la commande initiale. Cliquez à nouveau pour le retirer. Aucun système externe connecté.</p></div><span className="counter">{products.filter(p=>p.enabled).length} produits</span></div>
   {initial.length>0&&<section className="call-initial" aria-label="Commande initiale sélectionnée">
    <div className="call-initial__head"><div><p className="call-initial__title">{initial.length} référence{initial.length>1?'s':''} sélectionnée{initial.length>1?'s':''}</p><p className="call-initial__note">Tous ces produits sont déjà commandés.</p></div><strong className="call-initial__total num">{money(baseTotal)}</strong></div>
    <ul className="call-initial__lines" role="list">{initial.map(p=><li className="call-initial__line" key={p.id}>
     <div className="call-initial__product"><p className="call-initial__name">{p.short}</p><p className="call-initial__meta"><span className="num">{money(p.price)}</span> par unité, <span className="num">{money(lineTotal(p))}</span></p></div>
     <QuantityControl label={'Quantité initiale de '+p.name} value={quantityOf(p)} disabled={locked||busy||presenting} onChange={next=>changeInitialQuantity(p.id,next)}/>
     <button className="icon-btn" type="button" disabled={locked||busy||presenting} onClick={()=>changeInitial(baseIds.filter(id=>id!==p.id))} aria-label={'Retirer '+p.name+' de la commande initiale'}><Icon name="close"/></button>
    </li>)}</ul>
    {initial.length>1&&<label>Produit qui guide les questions<select value={baseId} disabled={locked} onChange={e=>changeInitial([e.target.value,...baseIds.filter(id=>id!==e.target.value)])}>{initial.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><small>Choisissez le produit lié au besoin prioritaire. Toute la commande reste prise en compte.</small></label>}
    {locked&&<p className="call-initial__locked"><Icon name="lock"/>Commande initiale conservée pour cet appel. Ouvrez un nouvel appel pour changer les produits de départ.</p>}
   </section>}
   <div className="call-order__filters">
    <div className="search-field"><Icon name="search"/><input type="search" aria-label="Rechercher un produit" placeholder="Ex. sérum, shampoing" value={search} onChange={e=>setSearch(e.target.value)}/></div>
    <div className="seg" role="group" aria-label="Univers">{['Tous','Visage','Cheveux','Corps','Packs'].map(d=><button type="button" key={d} className="seg__item" aria-pressed={scope===d} onClick={()=>{setScope(d);setCategory('Tous');}}>{d}</button>)}</div>
    <div className="seg" role="group" aria-label="Catégorie">{CATS.map(c=><button type="button" key={c} className="seg__item" aria-pressed={category===c} onClick={()=>setCategory(c)}>{c}</button>)}</div>
   </div>
   {visible.length>0&&<div className="call-order__grid">{visible.map(p=><button type="button" key={p.id} className="option option--product" data-kind="multi" onClick={()=>changeInitial(baseIds.includes(p.id)?baseIds.filter(id=>id!==p.id):[...baseIds,p.id])} disabled={locked} aria-pressed={baseIds.includes(p.id)}>
    <Photo product={p}/>
    <span className="option__indicator" aria-hidden="true"><Icon name="check"/></span>
    <span className="option__body"><span className="option__desc">{p.category}, {p.size}</span><span className="option__title">{p.name}</span>{isPack(p)&&<span className="option__desc">{p.components?.length?expand(p,products).map(c=>c.short).join(' + '):'Contenu à confirmer'}</span>}<span className="option__price num">{money(p.price)}</span></span>
   </button>)}</div>}
   {!visible.length&&<div className="empty"><Icon name="search"/><p className="empty__title">Aucun produit trouvé.</p><p>Essayez un autre nom ou une autre catégorie.</p><button type="button" className="btn btn--secondary" onClick={()=>{setSearch('');setCategory('Tous');}}>Réinitialiser la recherche</button></div>}
  </section>
  <div className="call-actions"><p className="call-actions__status">{base?`${initial.length} référence${initial.length>1?'s':''} dans la commande initiale`:'Choisissez au moins un produit pour poursuivre.'}</p><button type="button" className="btn btn--primary" disabled={!base} onClick={()=>toStep(1)}>Comprendre le besoin<Icon name="arrow"/></button></div>
 </>;
}
