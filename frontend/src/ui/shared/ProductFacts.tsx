import {isPack,expand,type Product} from '@touche/domain';

export function ProductFacts({product,catalogue}:{product:Product;catalogue:Product[]}){
 const members=isPack(product)?expand(product,catalogue).filter(x=>x.id!==product.id):[];
 return <div className="product-facts"><p className="product-pitch">{product.pitch||product.description}</p>{members.length>0&&<section><h4>Contenu du pack</h4>{members.map(p=><details key={p.id}><summary>{p.name}</summary><ProductFacts product={p} catalogue={catalogue}/></details>)}</section>}
 {!!product.ingredients?.length&&<section><h4>Ingrédient → rôle dans la formule</h4>{product.ingredients.map(i=><div className="ingredient-fact" key={i.name}><b>{i.name}</b><p>{i.role}</p><small>{i.inci}</small></div>)}</section>}
 {product.usage&&<section><h4>Utilisation à expliquer</h4><p>{product.usage}</p></section>}
 {!!product.cautions?.length&&<details><summary>Précautions pertinentes</summary>{product.cautions.map(c=><p key={c}>{c}</p>)}</details>}
 {product.inciText&&<details><summary>Liste INCI publiée</summary><p className="inci-text">{product.inciText}</p></details>}
 <p className="source-note">{product.formulaNote||'Consulter l’étiquette du lot.'}</p>{product.source&&<a href={product.source} target="_blank" rel="noreferrer" className="source-link">Source officielle Touché ↗</a>}{product.checkedAt&&<small>Fiche consultée le {product.checkedAt}. {product.priceSource}</small>}</div>;
}
