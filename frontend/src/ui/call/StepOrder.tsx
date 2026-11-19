import {quantityOf,lineTotal,isPack,expand,money,type Product} from '@touche/domain';
import QuantityControl from '../QuantityControl';
import {Icon} from '../shared/Icon';
import {Photo} from '../shared/Photo';
import {CATS} from '../shared/catalogue';
import {useCall} from './callModel';
import {outcomeLabel} from './callState';
import {focusLater} from './reveal';

/** A removed line takes its button with it: focus goes to the selected order, or to the search once it is empty. */
const AFTER_REMOVAL='#call-initial, .call-order .search-field input';

/** Step 01 · Commande initiale: pick every product of the initial order. Fixed once an offer is presented, once saved,
 *  and in an example (X10: an example never turns into a real call that would not be saved). A product already inside a
 *  selected pack is flagged with « Retirer » (DUPPACK); a removal hands focus to the selected order, since the button is
 *  gone with its line or notice. A search with no exact match shows the closest products (SEARCH). */
export function StepOrder(){const {toStep,saved,demo,savedOutcome,orderLocked:locked,busy,presenting,products,visible,nearby,search,setSearch,scope,setScope,category,setCategory,baseId,baseIds,base,initial,baseTotal,changeInitial,changeInitialQuantity,duplicate}=useCall();
 const lockText=demo?'Mode exemple : la commande initiale est fixée. Quittez l’exemple pour démarrer un vrai appel.':saved?(savedOutcome==='initial'?'Commande initiale conservée pour cet appel.':`${savedOutcome?`Appel enregistré (${outcomeLabel(savedOutcome)})`:'Appel déjà enregistré'} : la commande initiale ne change plus. Commencez le suivant pour une autre commande.`):'Commande initiale verrouillée : une offre a été présentée. Ouvrez un nouvel appel pour changer les produits de départ.';
 const toggle=(id:string)=>changeInitial(baseIds.includes(id)?baseIds.filter(x=>x!==id):[...baseIds,id]);
 const card=(p:Product)=><button type="button" key={p.id} className="option option--product" data-kind="multi" onClick={()=>toggle(p.id)} disabled={locked||busy||presenting} aria-pressed={baseIds.includes(p.id)}>
  <Photo product={p}/>
  <span className="option__indicator" aria-hidden="true"><Icon name="check"/></span>
  <span className="option__body"><span className="option__desc">{p.category}, {p.size}</span><span className="option__title">{p.name}</span>{isPack(p)&&<span className="option__desc">{p.components?.length?expand(p,products).map(c=>c.short).join(' + '):'Contenu à confirmer'}</span>}<span className="option__price num">{money(p.price)}</span></span>
 </button>;
 const reset=<button type="button" className="btn btn--secondary" onClick={()=>{setSearch('');setCategory('Tous');}}>Réinitialiser la recherche</button>;
 return <>
  <section className="card call-order" aria-labelledby="call-order-title">
   <div className="section-head"><div><h2 id="call-order-title">Quels produits a-t-elle commandés ?</h2><p>Sélectionnez chaque produit de la commande initiale. Cliquez à nouveau pour le retirer. Aucun système externe connecté.</p></div><span className="counter">{products.filter(p=>p.enabled).length} produits</span></div>
   {initial.length>0&&<section className="call-initial" id="call-initial" tabIndex={-1} aria-label="Commande initiale sélectionnée">
    <div className="call-initial__head"><div><p className="call-initial__title">{initial.length} référence{initial.length>1?'s':''} sélectionnée{initial.length>1?'s':''}</p><p className="call-initial__note">Tous ces produits sont déjà commandés.</p></div><strong className="call-initial__total num">{money(baseTotal)}</strong></div>
    <ul className="call-initial__lines" role="list">{initial.map(p=><li className="call-initial__line" key={p.id}>
     <div className="call-initial__product"><p className="call-initial__name">{p.short}</p><p className="call-initial__meta"><span className="num">{money(p.price)}</span> par unité, <span className="num">{money(lineTotal(p))}</span></p></div>
     <QuantityControl label={'Quantité initiale de '+p.name} value={quantityOf(p)} disabled={locked||busy||presenting} onChange={next=>changeInitialQuantity(p.id,next)}/>
     <button className="icon-btn" type="button" disabled={locked||busy||presenting} onClick={()=>void changeInitial(baseIds.filter(id=>id!==p.id)).then(done=>{if(done)focusLater(AFTER_REMOVAL);})} aria-label={'Retirer '+p.name+' de la commande initiale'}><Icon name="close"/></button>
    </li>)}</ul>
    {duplicate&&<div className="notice notice--warning call-initial__duplicate" role="status"><Icon name="alert" className="notice__icon"/><p className="notice__text"><b>{duplicate.product.short}</b> est déjà inclus dans {duplicate.pack.short}. Compté deux fois, il empêche toute proposition de complément.</p>{!locked&&<button type="button" className="btn btn--secondary btn--sm" disabled={busy||presenting} onClick={()=>void changeInitial(baseIds.filter(id=>id!==duplicate.product.id)).then(done=>{if(done)focusLater(AFTER_REMOVAL);})}>Retirer {duplicate.product.short}</button>}</div>}
    {initial.length>1&&<label>Produit qui guide les questions<select value={baseId} disabled={locked||busy||presenting} onChange={e=>changeInitial([e.target.value,...baseIds.filter(id=>id!==e.target.value)])}>{initial.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><small>Choisissez le produit lié au besoin prioritaire. Toute la commande reste prise en compte.</small></label>}
    {locked&&<p className="call-initial__locked"><Icon name="lock"/>{lockText}</p>}
   </section>}
   <div className="call-order__filters">
    <div className="search-field"><Icon name="search"/><input type="search" aria-label="Rechercher un produit" placeholder="Ex. sérum, shampoing" value={search} onChange={e=>setSearch(e.target.value)}/></div>
    <div className="seg" role="group" aria-label="Univers">{['Tous','Visage','Cheveux','Corps','Packs'].map(d=><button type="button" key={d} className="seg__item" aria-pressed={scope===d} onClick={()=>{setScope(d);setCategory('Tous');}}>{d}</button>)}</div>
    <div className="seg" role="group" aria-label="Catégorie">{CATS.map(c=><button type="button" key={c} className="seg__item" aria-pressed={category===c} onClick={()=>setCategory(c)}>{c}</button>)}</div>
   </div>
   {visible.length>0&&<div className="call-order__grid">{visible.map(card)}</div>}
   {!visible.length&&nearby.length>0&&<div className="call-nearby"><p className="call-nearby__title" role="status">Aucun résultat exact. Produits proches :</p><div className="call-order__grid">{nearby.map(card)}</div><div>{reset}</div></div>}
   {!visible.length&&!nearby.length&&<div className="empty"><Icon name="search"/><p className="empty__title">Aucun produit trouvé.</p><p>Essayez un autre nom ou une autre catégorie.</p>{reset}</div>}
  </section>
  <div className="call-actions"><p className="call-actions__status">{base?`${initial.length} référence${initial.length>1?'s':''} dans la commande initiale`:'Choisissez au moins un produit pour poursuivre.'}</p><button type="button" className="btn btn--primary" disabled={!base} onClick={()=>toStep(1)}>Comprendre le besoin<Icon name="arrow"/></button></div>
 </>;
}
