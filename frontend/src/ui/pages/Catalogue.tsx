import {money,type Product} from '@touche/domain';
import {Icon} from '../shared/Icon';
import {Photo} from '../shared/Photo';
import {normalize} from '../shared/catalogue';

export function Catalogue({search,setSearch,scope,setScope,products,inScope,setDetail}:{search:string;setSearch:(search:string)=>void;scope:string;setScope:(scope:string)=>void;products:Product[];inScope:(p:Product)=>boolean;setDetail:(product:Product|null)=>void}){
 const shown=products.filter(p=>inScope(p)&&normalize(p.name).includes(normalize(search)));
 return <>
  <div className="page-head"><div><h1>Le catalogue de conseil</h1><p>Les références Touché, avec leurs photos officielles. Prix existants conservés ; ajouts aux tarifs du site, modifiables dans Gestion. Disponibilité réelle à confirmer auprès de votre équipe.</p></div></div>
  <div className="cat-toolbar">
   <div className="search-field search-field--wide"><Icon name="search"/><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Ex. sérum, shampoing" aria-label="Rechercher dans le catalogue"/></div>
   <div className="seg" role="group" aria-label="Univers">{['Tous','Visage','Cheveux','Corps','Packs'].map(d=><button type="button" key={d} className="seg__item" aria-pressed={scope===d} onClick={()=>setScope(d)}>{d}</button>)}</div>
  </div>
  <p className="cat-count" role="status">{shown.length} référence{shown.length>1?'s':''}</p>
  {shown.length?<ul className="cat-grid" role="list">{shown.map(p=><li className="cat-card" key={p.id}>
   <Photo product={p}/>
   <div className="cat-card__body">
    <p className="cat-card__meta">{p.category}, {p.size}</p>
    <h2 className="cat-card__name">{p.name}</h2>
    <p className="cat-card__price num">{money(p.price)}</p>
    <p className="cat-card__desc">{p.description}</p>
    <div className="cat-card__tags">{p.enabled?<span className="tag tag--success"><Icon name="check"/>Activé</span>:<span className="tag tag--danger"><Icon name="alert"/>Désactivé</span>}<span className="tag tag--neutral"><Icon name="route"/>{p.recommendable?'Parcours actif':'Parcours conditionnel'}</span></div>
    <button type="button" className="link-btn cat-card__open" onClick={()=>setDetail(p)}>Voir la fiche<Icon name="arrow"/></button>
   </div>
  </li>)}</ul>:<div className="empty"><Icon name="search"/><p className="empty__title">Aucune référence ne correspond à « {search} ».</p><p>Essayez un autre nom ou un autre univers.</p><button type="button" className="btn btn--secondary" onClick={()=>{setSearch('');setScope('Tous');}}>Effacer la recherche</button></div>}
 </>;
}
