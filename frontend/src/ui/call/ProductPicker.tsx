import {useEffect,useRef,useState} from 'react';
import {money} from '@touche/domain';
import {Button} from '../shared/Button';
import {Icon} from '../shared/Icon';
import {Photo} from '../shared/Photo';
import {useCall,type CallRequest} from './callModel';
import {pickerOrder} from './callState';
import {focusLater,reveal} from './reveal';

const rowAction=(id:string)=>`#picker-row-${id} .call-product__action`;
/** The whole check box comes into view (nearest edge, no smooth scroll when motion is reduced); focus goes to its title. */
function showCheck(id:string){const box=document.getElementById('request-confirm-'+id);reveal(box,'nearest',box?.querySelector<HTMLElement>('.call-product__confirm-title'));}

/**
 * Step 03 · one list for suggested and customer-requested products, with compatibility checks.
 * Without a search it lists the suggestions and the products already added, with « Voir tout le catalogue (N) » (STEP3).
 * An added product keeps its row, as « Ajouté ✓ · Retirer », and the rows keep their order until the search changes, so a
 * second click never lands on another product (B5, DBL); focus stays on that row's button and the change is announced.
 * « Ajouter » that needs a check opens the box in view with focus on its title; « Annuler » returns to « Ajouter » (CONFIRMBOX).
 */
export function ProductPicker(){const {saved,busy,presenting,setDetail,candidates,requests,requestApproximate,requestSearch,setRequestSearch,confirmId,setConfirmId,addComplement,removeComplement,count,upgradeId}=useCall();
 const [showAll,setShowAll]=useState(false);
 const searching=!!requestSearch.trim();
 // The order on screen, kept while the search and the « whole catalogue » choice stay the same.
 const shown=useRef<{key:string;ids:string[]}>({key:'',ids:[]});
 const key=[requestSearch,showAll?'all':'',upgradeId].join('|');
 const byId=new Map(requests.map(r=>[r.product.id,r]));
 const view=pickerOrder(requests.map(r=>({id:r.product.id,suggested:!!r.suggestion,added:r.added})),{previous:shown.current.key===key?shown.current.ids:null,showAll,searching});
 shown.current={key,ids:view.ids};
 const rows=view.ids.map(id=>byId.get(id)).filter((r):r is CallRequest=>!!r);
 // Focus moves into the check box only when « Ajouter » opened it.
 const opened=useRef('');
 useEffect(()=>{if(!confirmId||opened.current!==confirmId)return;opened.current='';showCheck(confirmId);},[confirmId]);
 function add({product:p,check,suggestion}:CallRequest){addComplement(p.id,check.verifyIds,!suggestion);focusLater(rowAction(p.id));}
 function act(r:CallRequest){
  if(r.added){removeComplement(r.product.id);return;}
  if(!r.suggestion&&r.check.warnings.length>0){
   if(confirmId===r.product.id){showCheck(r.product.id);return;}
   opened.current=r.product.id;setConfirmId(r.product.id);return;
  }
  add(r);
 }
 function cancel(id:string){setConfirmId('');focusLater(rowAction(id));}
 function search(value:string){setRequestSearch(value);setConfirmId('');}
 return <section className="card call-picker" aria-labelledby="product-picker-heading">
   <div className="section-head"><div><h2 id="product-picker-heading">Ajouter un produit à la routine</h2><p>Les produits suggérés apparaissent en premier. Recherchez un produit demandé par la cliente : sa compatibilité est vérifiée de la même façon.</p></div><span className="counter">{count} unité{count>1?'s':''}</span></div>
   <div className="search-field"><Icon name="search"/><input type="search" aria-label="Rechercher un produit à ajouter" placeholder="Ex. crème solaire, shampoing" value={requestSearch} onChange={e=>search(e.target.value)}/></div>
   {!candidates.length&&!searching&&<p className="notice notice--plain call-picker__notice"><Icon name="info" className="notice__icon"/><span className="notice__text">Aucune suggestion adaptée pour le moment. Recherchez un produit demandé par la cliente, ou ouvrez tout le catalogue, pour vérifier sa compatibilité.</span></p>}
   {requestApproximate&&rows.length>0&&<p className="call-picker__approx" role="status">Aucun résultat exact. Produits proches :</p>}
   {(rows.length>0||searching)&&<div className="call-picker__list" role="region" aria-label="Produits à ajouter" tabIndex={0}>{rows.length?<ul className="call-picker__rows" role="list">{rows.map(r=>{
    const {product:p,check:chk,suggestion,added}=r;
    const needsConfirmation=!added&&!suggestion&&chk.warnings.length>0,confirming=needsConfirmation&&confirmId===p.id,blockedRow=!added&&!!chk.blocked;
    return <li key={p.id} id={'picker-row-'+p.id} className="call-product" data-state={added?'added':blockedRow?'blocked':confirming?'check':suggestion?'suggested':'default'}>
     <Photo product={p} small/>
     <div className="call-product__main">
      <div className="call-product__title"><h3 className="call-product__name">{p.name}</h3>{suggestion&&<span className="tag tag--neutral"><Icon name="spark"/>Suggéré</span>}{!blockedRow&&!added&&needsConfirmation&&<span className="tag tag--warning"><Icon name="alert"/>À vérifier</span>}</div>
      <p className="call-product__meta">{p.category}, {p.size}</p>
      {suggestion&&<p className="call-product__reason">{suggestion.reason}</p>}
      {blockedRow&&<p className="call-product__blocked"><Icon name="lock"/>{chk.blocked}</p>}
      <button type="button" className="link-btn link-btn--sm" aria-label={'Voir la fiche de '+p.name} onClick={()=>setDetail(p)}>Voir la fiche</button>
     </div>
     <div className="call-product__side"><span className="call-product__price num">{money(p.price)}</span>
      {added&&<span className="call-product__added"><Icon name="check"/>Ajouté</span>}
      {!blockedRow&&<Button size="sm" className="call-product__action" guard disabled={saved||(added&&(busy||presenting))} aria-label={(added?'Retirer ':'Ajouter ')+p.name+(added?' de la routine':'')} aria-expanded={needsConfirmation?confirming:undefined} aria-controls={needsConfirmation?'request-confirm-'+p.id:undefined} onClick={()=>act(r)}>{added?<>Retirer</>:<><Icon name="plus"/>Ajouter</>}</Button>}
     </div>
     {!blockedRow&&confirming&&<div className="call-product__confirm" id={'request-confirm-'+p.id} role="group" aria-labelledby={'request-confirm-title-'+p.id}><h4 className="call-product__confirm-title" id={'request-confirm-title-'+p.id} tabIndex={-1}><Icon name="alert"/>À vérifier avant l’ajout</h4><ul className="call-product__warnings">{chk.warnings.map(w=><li key={w}>{w}</li>)}</ul><div className="call-product__confirm-actions"><button type="button" className="btn btn--primary btn--sm" disabled={saved} onClick={()=>add(r)}>Confirmer : la cliente le demande, compatibilité vérifiée</button><button type="button" className="btn btn--ghost btn--sm" onClick={()=>cancel(p.id)}>Annuler</button></div></div>}
    </li>;
   })}</ul>:<div className="empty"><Icon name="search"/><p className="empty__title">Aucun produit ne correspond à cette recherche.</p><button type="button" className="btn btn--secondary btn--sm" onClick={()=>search('')}>Effacer la recherche</button></div>}</div>}
   {!searching&&(view.hidden>0||showAll)&&<button type="button" className="btn btn--ghost btn--sm call-picker__more" aria-expanded={showAll} onClick={()=>setShowAll(x=>!x)}>{showAll?'Ne montrer que les suggestions':`Voir tout le catalogue (${view.hidden})`}</button>}
   <p className="footnote">Pour plusieurs unités d’un même produit, ajustez sa quantité dans « Votre routine ». Les vérifications de compatibilité et les alertes restent appliquées.</p>
  </section>;
}
