import {cataloguePath,searchIds,type Product,type Brand} from '@touche/domain';
import {BrandSwitch,ofBrand} from '../shared/BrandSwitch';
import {Icon} from '../shared/Icon';

/** Parcours produits (PN6: the h1 names the view; PN4: a result count and an empty state with a reset). */
export function Coverage({search,setSearch,products:all,setDetail,brand,setBrand}:{search:string;setSearch:(search:string)=>void;products:Product[];setDetail:(product:Product|null)=>void;brand:Brand;setBrand:(brand:Brand)=>void}){
 // One brand at a time: each path and its complements stay within the brand shown.
 const products=ofBrand(all,brand),ids=searchIds(products,search),shown=products.filter(p=>ids.has(p.id));
 return <>
  <div className="page-head"><div><h1 tabIndex={-1}>Parcours produits</h1><p>Un parcours pour chaque référence. Les associations ci-dessous sont des pistes : le questionnaire vérifie les besoins, les composants, les précautions et les doublons avant de les classer.</p></div></div>
  <div className="cat-toolbar"><div className="search-field search-field--wide"><Icon name="search"/><input type="search" aria-label="Rechercher un parcours" value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Rechercher dans les ${products.length} parcours`}/></div><BrandSwitch products={all} brand={brand} setBrand={setBrand}/></div>
  <p className="cat-count" role="status">{search.trim()?`${shown.length} parcours sur ${products.length}`:`${products.length} parcours`}</p>
  {shown.length?<ul className="cat-paths" role="list">{shown.map(p=>{const route=cataloguePath(p,products);return <li className="card cat-path" key={p.id}>
   <div className="cat-path__head"><h2>{p.name}</h2><span className="tag tag--neutral">{route.mode}</span></div>
   <p>{route.purpose}</p>
   <h3>Questions utiles</h3>
   <ul className="cat-path__list">{route.questions.map(q=><li key={q}>{q}</li>)}</ul>
   <h3>Compléments à étudier</h3>
   {route.complements.length?<div className="cat-path__links">{route.complements.map(id=>{const c=products.find(x=>x.id===id)!;return <button type="button" className="btn btn--secondary btn--sm" key={id} onClick={()=>setDetail(c)}>{c.short}</button>})}</div>
    :<p className="cat-path__none">Vérifier d’abord la fiche et le contenu exact ; aucun produit supplémentaire arbitraire.</p>}
   {route.checks.map(c=><p className="notice notice--info" key={c}><Icon name="info" className="notice__icon"/><span className="notice__text">{c}</span></p>)}
   <button type="button" className="link-btn" onClick={()=>setDetail(p)}>Voir les ingrédients et l’argumentaire<Icon name="arrow"/></button>
  </li>})}</ul>:<div className="empty"><Icon name="search"/><p className="empty__title">Aucun parcours ne correspond à « {search} ».</p><p>Cherchez par nom de produit, catégorie ou besoin (« solaire », « chute », « shampoing »).</p><button type="button" className="btn btn--secondary" onClick={()=>setSearch('')}>Réinitialiser la recherche</button></div>}
 </>;
}
