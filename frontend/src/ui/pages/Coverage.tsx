import {cataloguePath,type Product} from '@touche/domain';
import {Icon} from '../shared/Icon';
import {normalize} from '../shared/catalogue';

export function Coverage({search,setSearch,products,setDetail}:{search:string;setSearch:(search:string)=>void;products:Product[];setDetail:(product:Product|null)=>void}){
 const shown=products.filter(p=>normalize(p.name).includes(normalize(search)));
 return <>
  <div className="page-head"><div><h1>Un parcours pour chaque référence</h1><p>Les associations ci-dessous sont des pistes. Le questionnaire vérifie les besoins, les composants, les précautions et les doublons avant de les classer.</p></div></div>
  <div className="cat-toolbar"><div className="search-field search-field--wide"><Icon name="search"/><input type="search" aria-label="Rechercher un parcours" value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Rechercher dans les ${products.length} parcours`}/></div></div>
  <ul className="cat-paths" role="list">{shown.map(p=>{const route=cataloguePath(p,products);return <li className="card cat-path" key={p.id}>
   <div className="cat-path__head"><h2>{p.name}</h2><span className="tag tag--neutral">{route.mode}</span></div>
   <p>{route.purpose}</p>
   <h3>Questions utiles</h3>
   <ul className="cat-path__list">{route.questions.map(q=><li key={q}>{q}</li>)}</ul>
   <h3>Compléments à étudier</h3>
   {route.complements.length?<div className="cat-path__links">{route.complements.map(id=>{const c=products.find(x=>x.id===id)!;return <button type="button" className="btn btn--secondary btn--sm" key={id} onClick={()=>setDetail(c)}>{c.short}</button>})}</div>
    :<p className="cat-path__none">Vérifier d’abord la fiche et le contenu exact ; aucun produit supplémentaire arbitraire.</p>}
   {route.checks.map(c=><p className="notice notice--info" key={c}><Icon name="info" className="notice__icon"/><span className="notice__text">{c}</span></p>)}
   <button type="button" className="link-btn" onClick={()=>setDetail(p)}>Voir les ingrédients et l’argumentaire<Icon name="arrow"/></button>
  </li>})}</ul>
 </>;
}
