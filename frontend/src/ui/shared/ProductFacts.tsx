import {isPack,expand,type Product} from '@touche/domain';
import {Icon} from './Icon';

export function ProductFacts({product,catalogue}:{product:Product;catalogue:Product[]}){
 const members=isPack(product)?expand(product,catalogue).filter(x=>x.id!==product.id):[];
 return <div className="cat-facts"><p className="cat-facts__pitch">{product.pitch||product.description}</p>
  {members.length>0&&<section className="cat-facts__section"><h3>Contenu du pack</h3>{members.map(p=><details key={p.id}><summary>{p.name}</summary><ProductFacts product={p} catalogue={catalogue}/></details>)}</section>}
  {!!product.ingredients?.length&&<section className="cat-facts__section"><h3>Ingrédient et rôle dans la formule</h3><dl className="cat-facts__ingredients">{product.ingredients.map(i=><div className="cat-facts__ingredient" key={i.name}><dt>{i.name}</dt><dd>{i.role}</dd><dd className="cat-facts__inci">{i.inci}</dd></div>)}</dl></section>}
  {product.usage&&<section className="cat-facts__section"><h3>Utilisation à expliquer</h3><p>{product.usage}</p></section>}
  {!!product.cautions?.length&&<details><summary>Précautions pertinentes</summary><ul className="cat-facts__list">{product.cautions.map(c=><li key={c}>{c}</li>)}</ul></details>}
  {product.inciText&&<details><summary>Liste INCI publiée</summary><p className="cat-facts__inci-text">{product.inciText}</p></details>}
  <p className="cat-facts__note">{product.formulaNote||'Consulter l’étiquette du lot.'}</p>
  {product.source&&<a href={product.source} target="_blank" rel="noreferrer" className="cat-facts__link">Source officielle Touché<Icon name="external" size={16}/><span className="sr-only"> (nouvel onglet)</span></a>}
  {product.checkedAt&&<p className="footnote">Fiche consultée le {product.checkedAt}. {product.priceSource}</p>}
 </div>;
}
