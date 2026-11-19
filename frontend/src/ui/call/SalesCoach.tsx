import {salesPitch,objections,type Profile,type Product,type Tier} from '@touche/domain';
import {Icon} from '../shared/Icon';

/** The adviser's script and objection replies; each copy says what it copied (COPY). */
export function SalesCoach({base,initial,basket,profile,tier,catalogue,copy,preview}:{base:Product;initial:Product[];basket:Product[];profile:Profile;tier:Tier;catalogue:Product[];copy:(text:string,label:string)=>Promise<void>;preview:boolean}){
 const pitch=salesPitch(base,basket,profile,tier,catalogue,initial),replies=objections(base,basket,profile,tier,catalogue,initial);
 return <section className="card call-script" aria-labelledby="call-script-title">
  <div className="section-head"><div><h2 id="call-script-title">L’argumentaire de la conseillère</h2><p>{preview?'Aperçu pour le complément prioritaire : il n’est pas encore ajouté au panier.':'Adapté aux réponses et à la composition affichée.'}</p></div><button type="button" className="btn btn--ghost btn--sm" onClick={()=>copy(pitch.text,'Argumentaire copié.')}><Icon name="copy"/>Copier l’argumentaire</button></div>
  <ol className="call-script__steps" role="list">
   <li className="call-script__step"><p className="call-script__label"><span className="call-script__n">1</span>Repartir du besoin</p><p className="call-say">« {pitch.opener} »</p></li>
   <li className="call-script__step"><p className="call-script__label"><span className="call-script__n">2</span>Expliquer l’utilité</p><p className="call-say">« {pitch.value} »</p>{!!pitch.facts.length&&<details className="call-script__facts"><summary>Les ingrédients pour étayer l’explication</summary><ul role="list">{pitch.facts.map(f=><li key={f}>{f}</li>)}</ul><p className="footnote">Rôles cosmétiques documentés, pas garantie de résultat.</p></details>}</li>
   <li className="call-script__step"><p className="call-script__label"><span className="call-script__n">3</span>Chiffrer et conclure</p><p className="call-say">« {pitch.price} {pitch.close} »</p></li>
  </ol>
  <div className="call-objections"><h3>Répondre aux objections</h3>{replies.map(r=><details className="call-objection" key={r.key}><summary>{r.title}</summary><div className="call-objection__body"><p className="call-script__label">Clarifier</p><p className="call-say">« {r.probe} »</p><p className="call-script__label">Argumenter</p><p className="call-say">« {r.answer} »</p><p className="call-script__label">Obtenir une décision</p><p className="call-say">« {r.close} »</p><p className="call-objection__action">{r.action}</p><button type="button" className="link-btn link-btn--sm" onClick={()=>copy([r.probe,r.answer,r.close].join('\n\n'),'Réponse copiée.')}><Icon name="copy"/>Copier cette réponse</button></div></details>)}</div>
 </section>;
}
