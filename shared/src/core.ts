import {itemsTotal,lineTotal,quantityOf,quantityLabel,sameOrder,unitCount,type WithQuantity} from './quantity.js';
import {BRAND_LABELS,brandOf,type Brand} from './brands.js';
import {BEL_CONCERNS,BEL_TARGETED,DOUBLE_CLEANSE_LINE,TARGETED_BONUS,asksRetinol,doubleCleanse,makeupBonus,pairingBonus} from './belnco.js';
export type Ingredient={name:string;inci:string;role:string};
export type Product={id:string;name:string;short:string;category:string;price:number;image:string;source:string;description:string;concerns:string[];skins:string[];active:boolean;size:string;enabled:boolean;recommendable:boolean;review:string;priceSource?:string;domain?:'face'|'hair'|'body';components?:string[];ingredients?:Ingredient[];inciText?:string;formulaNote?:string;checkedAt?:string;pitch?:string;usage?:string;cautions?:string[];fragrance?:boolean;essentialOils?:boolean;gentle?:boolean;exfoliant?:boolean;verificationRequired?:string;brand?:Brand;excludes?:string[];photosensitizing?:boolean};
export type Profile={concerns:string[];skin:string;sensitive:string;routine:string[];routineKnown:boolean;safety:string[];severity:string;marks:string;redState?:string;hairPattern?:string;allergens?:string[];age?:string;scalpProtocol?:boolean;verifiedProducts?:string[];makeup?:string;retinol?:string};
export type Candidate={product:Product;score:number;reason:string};
export type Tier='catalogue'|'duo'|'final';
export type OrderItem=Product&WithQuantity;
export const FACE_CONCERNS=[['acne','Boutons','Imperfections légères ou occasionnelles'],['blackheads','Points noirs','Pores obstrués et comédons'],['oil','Brillance','Excès de sébum'],['marks','Marques brunes','Traces de couleur après les boutons'],['red','Rougeurs légères','Hors brûlure, gonflement ou douleur'],['dry','Tiraillements','Peau sèche, inconfort quotidien'],['dehydration','Déshydratation','Manque de confort hydrique'],['dull','Teint terne','Manque d’éclat'],['aging','Rides et fermeté','Ridules, fermeté, éclat qui baisse'],['scars','Cicatrices en relief','Distinguer cicatrice et simple marque']];
export const HAIR_CONCERNS=[['growth','Longueurs / pousse','Objectif de longueur et aspect des cheveux'],['breakage','Casse et démêlage','Cheveux cassants, pointes et nœuds'],['fall','Chute de cheveux','Distinguer perte à la racine et casse'],['hairdry','Longueurs sèches','Manque de souplesse, frisottis'],['scalpoil','Racines grasses','Besoin d’une étape lavante adaptée'],['flakes','Pellicules','Ne pas les assimiler au psoriasis'],['scalpcomfort','Confort du cuir chevelu','Sensibilité légère, hors lésion ou brûlure']];
export const BODY_CONCERNS=[['bodyspots','Imperfections du corps','Dos, épaules ou torse : préciser la zone'],['bodydry','Sécheresse corporelle','Besoin de confort et d’hydratation']];
export const CONCERNS=[...FACE_CONCERNS,...HAIR_CONCERNS,...BODY_CONCERNS];
export const SKINS=[['oily','Grasse'],['mixed','Mixte'],['normal','Normale'],['dry','Sèche'],['unknown','Je ne sais pas']];
export const HAIR_TYPES=[['oily','Racines grasses'],['mixed','Racines grasses, longueurs sèches'],['normal','Équilibrés'],['dry','Secs / très secs'],['unknown','À préciser']];
export const ROUTINES=[['Nettoyant','Nettoyant'],['Soin ciblé','Sérum / actif'],['Hydratant','Crème hydratante'],['Protection solaire','Protection solaire']];
export const HAIR_ROUTINES=[['Shampoing','Shampoing adapté'],['Après-shampoing','Après-shampoing / masque'],['Soin cuir chevelu','Soin du cuir chevelu']];
export const BODY_ROUTINES=[['Nettoyant corps','Nettoyant du corps'],['Soin ciblé','Soin ciblé sur cette zone'],['Hydratant','Hydratant corporel']];
export const SIGNALS=[['none','Aucun point particulier'],['irritation','Irritation active / brûlure'],['urgent','Gonflement important / réaction sévère'],['allergy','Allergie connue'],['treatment','Traitement dermatologique en cours'],['pregnancy','Grossesse / allaitement'],['minor','Produit destiné à un mineur'],['unknown','Information à préciser']];
export const ALLERGENS=[['fragrance','Parfum'],['essential','Huiles essentielles'],['mi','MI / MCI (conservateurs)'],['nuts','Noisette / amande / sésame'],['salicylates','Salicylates'],['unknown','Autre / non identifié']];
export const EMPTY_PROFILE:Profile={concerns:[],skin:'',sensitive:'',routine:[],routineKnown:false,safety:[],severity:'',marks:'',redState:'',hairPattern:'',allergens:[],age:'',makeup:'',retinol:''};
// True only when the patch sets at least one answer to a different value (lists compare by content and order).
export const profileChanges=(p:Profile,patch:Partial<Profile>):boolean=>Object.entries(patch).some(([k,v])=>JSON.stringify(p[k as keyof Profile])!==JSON.stringify(v));
export const money=(n:number)=>new Intl.NumberFormat('fr-DZ',{maximumFractionDigits:0}).format(n)+' DA';
export const domainOf=(p?:Product)=>p?.domain||'face';
export const concernsFor=(p?:Product)=>brandOf(p)==='belnco'?BEL_CONCERNS:domainOf(p)==='hair'?HAIR_CONCERNS:domainOf(p)==='body'?BODY_CONCERNS:FACE_CONCERNS;
export const routinesFor=(p?:Product)=>domainOf(p)==='hair'?HAIR_ROUTINES:domainOf(p)==='body'?BODY_ROUTINES:ROUTINES;
/** A priority's label in the call's brand; a priority the brand does not offer (kept after « Marque » changed) keeps
 *  its own label, never its id. */
export const concernLabel=(id:string,base?:Product):string=>(concernsFor(base).find(c=>c[0]===id)??CONCERNS.find(c=>c[0]===id))?.[1]||id;
export const labelConcern=(p:Profile,base?:Product)=>(brandOf(base)==='belnco'?BEL_CONCERNS:CONCERNS).find(c=>c[0]===p.concerns[0])?.[1]?.toLowerCase()||'votre besoin';
export function priceOffer(total:number,tier:Tier,count=2):number{
 if(!Number.isSafeInteger(total)||total<0)throw new Error('Montant invalide');
 if(count<2||tier==='catalogue')return total;
 return Math.min(total,Math.ceil((total*(tier==='duo'?10:9))/1100)*100);
}
export const isPack=(p:{category?:string})=>p.category==='Pack';
export function expand(p:Product,catalogue:Product[]):Product[]{
 if(!isPack(p))return[p];
 if(!p.components?.length)return[p];
 return p.components.map(id=>catalogue.find(x=>x.id===id)).filter((x):x is Product=>!!x);
}
export function physicalCount(basket:OrderItem[],catalogue:Product[]):number{return basket.reduce((s,p)=>s+quantityOf(p)*expand(p,catalogue).length,0);}
/**
 * The pricing rules a desk computes offers with, announced on every POST (X-Desk-Pricing). Change it whenever these
 * rules change: a tab opened before cannot fix its amounts by reloading the catalogue, so the server tells it to reload
 * the page instead.
 */
export const PRICING_RULE='pack-sets';
/** An order line, live or frozen in a snapshot: enough to price it. */
export type PricedLine=WithQuantity&{id:string;price:number;category?:string};
export type HairPackSet={pack:Product;count:number};
/**
 * A hair pack or a BEL.NCO pack (the double cleansing ritual) whose price applies to its components chosen one by one
 * (Touché body duo and Junior excluded): at least two of them, and the pack cheaper than they are at list price, so the
 * pack price is always a saving. An invalid pack price stays eligible, for basketOffer to refuse it.
 */
const pairPack=(p:Product,catalogue:Product[])=>{
 if(!isPack(p)||!(p.domain==='hair'||brandOf(p)==='belnco')||(p.components?.length??0)<2)return false;
 const sum=p.components!.reduce((s,id)=>s+(catalogue.find(x=>x.id===id)?.price??Number.NaN),0);
 return !Number.isSafeInteger(p.price)||p.price<sum;
};
/**
 * Pricing only: separate lines covering every component of a set-priced pack (pairPack) cost that pack, at its price.
 * Greedy in catalogue order; only non-pack lines count as components; sets = smallest component quantity. `rest` holds
 * the lines left once the units used by the sets are removed. The recorded products stay the separate products.
 */
export function hairPackSets<T extends PricedLine>(items:T[],catalogue:Product[]):{sets:HairPackSet[];rest:T[]}{
 const left=new Map<string,number>(),used=new Map<string,number>(),sets:HairPackSet[]=[];
 for(const p of items)if(!isPack(p))left.set(p.id,(left.get(p.id)??0)+quantityOf(p));
 for(const pack of catalogue.filter(p=>pairPack(p,catalogue))){
  const need=new Map<string,number>();
  for(const id of pack.components!)need.set(id,(need.get(id)??0)+1);
  const count=Math.min(...[...need].map(([id,n])=>Math.floor((left.get(id)??0)/n)));
  if(count<1)continue;
  sets.push({pack,count});
  for(const [id,n] of need){left.set(id,left.get(id)!-count*n);used.set(id,(used.get(id)??0)+count*n);}
 }
 const rest=items.flatMap(p=>{
  if(isPack(p))return[p];
  const q=quantityOf(p),take=Math.min(used.get(p.id)??0,q);
  if(take)used.set(p.id,used.get(p.id)!-take);
  return take===0?[p]:q>take?[{...p,quantity:q-take}]:[];
 });
 return{sets,rest};
}
const setsTotal=(sets:HairPackSet[])=>sets.reduce((s,x)=>s+x.count*x.pack.price,0);
/** Catalogue value with complete hair-pack sets at the pack price: pack lines, sets, then the remaining singles. */
export function pricedTotal(items:PricedLine[],catalogue:Product[]):number{const{sets,rest}=hairPackSets(items,catalogue);return setsTotal(sets)+itemsTotal(rest);}
export function basketOffer(basket:OrderItem[],tier:Tier,catalogue:Product[]):number{
 if(basket.some(p=>!Number.isSafeInteger(p.price)||p.price<0))throw new Error('Montant invalide');
 const{sets,rest}=hairPackSets(basket,catalogue);
 if(sets.some(x=>!Number.isSafeInteger(x.pack.price)||x.pack.price<0))throw new Error('Montant invalide');
 const total=setsTotal(sets)+itemsTotal(rest);
 if(unitCount(basket)<2||tier==='catalogue')return total;
 const packs=setsTotal(sets)+itemsTotal(rest.filter(isPack));
 if(!packs)return priceOffer(total,tier,unitCount(basket));
 // Pack tariffs (pack lines and complete hair-pack sets) are protected. Discount only the other singles, one final upward rounding.
 return Math.min(total,Math.ceil((packs*11+(total-packs)*(tier==='duo'?10:9))/1100)*100);
}
/** Existing products alone retain their catalogue/pack prices; discounts apply to an upsell. */
export function orderOffer(initial:OrderItem[],basket:OrderItem[],tier:Tier,catalogue:Product[]):number{
 const unchanged=sameOrder(initial,basket);
 return basketOffer(basket,unchanged?'catalogue':tier,catalogue);
}
export function basketProblem(basket:OrderItem[],catalogue:Product[]):string|null{
 const flat=basket.flatMap(p=>expand(p,catalogue));
 if(basket.some(p=>isPack(p)&&(!p.components?.length||expand(p,catalogue).length!==p.components.length))&&unitCount(basket)>1)return'Le contenu exact de ce pack doit être confirmé avant tout ajout.';
 if(new Set(flat.map(p=>p.id)).size!==flat.length)return'Un produit est déjà inclus dans le pack ou la routine.';
 for(let i=0;i<flat.length;i++)for(let j=i+1;j<flat.length;j++)if(excludesEachOther(flat[i],flat[j]))return`${flat[i].short} et ${flat[j].short} ne s’utilisent jamais dans la même routine : gardez l’un ou l’autre.`;
 return null;
}
/** Two products that never go in the same routine: the rule counts when either one lists the other in `excludes`. */
export const excludesEachOther=(a:Product,b:Product):boolean=>!!a.excludes?.includes(b.id)||!!b.excludes?.includes(a.id);
/** One brand per call: the first item, or pack component, of another brand than the call's. */
export function brandProblem(items:Product[],brand:Brand,catalogue:Product[]):string|null{
 const p=items.flatMap(x=>[x,...expand(x,catalogue)]).find(x=>brandOf(x)!==brand);
 return p?`« ${p.name} » est une référence ${BRAND_LABELS[brandOf(p)]} : un appel ${BRAND_LABELS[brand]} ne propose que des références ${BRAND_LABELS[brand]}.`:null;
}
/** An add-on must raise the order: a discount on the whole basket may not bring it to, or below, what the customer already ordered. */
export function offerProblem(initial:OrderItem[],basket:OrderItem[],tier:Tier,catalogue:Product[]):string|null{
 if(!initial.length||sameOrder(initial,basket))return null;
 return raiseProblem(orderOffer(initial,basket,tier,catalogue),pricedTotal(initial,catalogue));
}
/** The same rule on amounts already fixed, such as a presented offer and the initial value it was presented against. */
export function raiseProblem(offer:number,base:number):string|null{
 return offer>base?null:`À ce niveau de prix, l’offre (${money(offer)}) ne dépasse pas la commande initiale (${money(base)}) : choisissez un autre prix ou ajoutez un produit.`;
}
/** A product ordered together with a pack that already contains it. */
export function packDuplicate(items:Product[],catalogue:Product[]):{pack:Product;product:Product}|null{
 for(const pack of items.filter(isPack))for(const product of items)if(product.id!==pack.id&&expand(pack,catalogue).some(x=>x.id===product.id||(isPack(product)&&expand(product,catalogue).some(y=>y.id===x.id))))return{pack,product};
 return null;
}
export function questionsReady(p:Profile,base?:Product):boolean{
 return p.concerns.length>0&&!!p.skin&&!!p.sensitive&&p.routineKnown&&p.safety.length>0&&(!p.concerns.includes('acne')||!!p.severity)&&(!p.concerns.includes('marks')||!!p.marks)&&(!p.concerns.includes('red')||!!p.redState)&&(!p.concerns.includes('fall')||!!p.hairPattern)&&(!p.safety.includes('allergy')||!!p.allergens?.length)&&(!p.safety.includes('minor')||!!p.age)&&(brandOf(base)!=='belnco'||(!!p.makeup&&(!asksRetinol(p.concerns)||!!p.retinol)));
}
export type MissingAnswer={question:'01'|'02'|'03'|'04'|'05';label:string};
// The answers questionsReady still waits for, in screen order. Empty exactly when questionsReady is true.
// BEL.NCO asks makeup as question 03, so its routine and safety questions are 04 and 05.
export function missingAnswers(p:Profile,base?:Product):MissingAnswer[]{
 const hair=domainOf(base)==='hair',bel=brandOf(base)==='belnco',[routine,safety]=bel?['04','05'] as const:['03','04'] as const,m:MissingAnswer[]=[];
 if(!p.concerns.length)m.push({question:'01',label:'la priorité de la cliente'});
 if(p.concerns.includes('acne')&&!p.severity)m.push({question:'01',label:'le type de boutons'});
 if(p.concerns.includes('marks')&&!p.marks)m.push({question:'01',label:'le type de marque'});
 if(p.concerns.includes('red')&&!p.redState)m.push({question:'01',label:'le type de rougeurs'});
 if(bel&&asksRetinol(p.concerns)&&!p.retinol)m.push({question:'01',label:'l’usage du rétinol'});
 if(p.concerns.includes('fall')&&!p.hairPattern)m.push({question:'01',label:'le type de chute'});
 if(!p.skin)m.push({question:'02',label:hair?'le profil capillaire':'le type de peau'});
 if(!p.sensitive)m.push({question:'02',label:hair?'la sensibilité du cuir chevelu':'la sensibilité habituelle'});
 if(bel&&!p.makeup)m.push({question:'03',label:'le maquillage et la protection solaire'});
 if(!p.routineKnown)m.push({question:routine,label:'les soins déjà utilisés'});
 if(!p.safety.length)m.push({question:safety,label:'les précautions utiles'});
 if(p.safety.includes('allergy')&&!p.allergens?.length)m.push({question:safety,label:'l’allergène concerné'});
 if(p.safety.includes('minor')&&!p.age)m.push({question:safety,label:'l’âge d’utilisation'});
 return m;
}
export type ReviewStopCode='urgent'|'irritation'|'severe-acne'|'hair-loss'|'child'|'unknown-allergen';
/** Why the offer stops, what the adviser reads to the customer for that exact reason, and whether a follow-up call is expected. */
export type ReviewStop={code:ReviewStopCode;text:string;script:string;urgent:boolean;followUp:boolean};
export function reviewStop(p:Profile):ReviewStop|null{
 if(p.safety.includes('urgent'))return{code:'urgent',urgent:true,followUp:false,text:'Réaction sévère ou gonflement important : arrêter la proposition commerciale et demander un avis médical rapidement. Difficulté à respirer, lèvres ou langue gonflées : aide médicale urgente.',script:'« Ce que vous me décrivez doit être vu rapidement par un médecin : je ne vous propose aucun produit aujourd’hui. Si vous avez du mal à respirer, ou si vos lèvres ou votre langue gonflent, contactez immédiatement les secours. »'};
 if(p.safety.includes('irritation')||p.redState==='severe')return{code:'irritation',urgent:false,followUp:true,text:'Ne pas ajouter de soin sur une zone actuellement brûlante, douloureuse, lésée ou très irritée. Faire vérifier la situation avant de poursuivre ; si elle est importante ou persiste, avis médical.',script:'« Je ne vais rien ajouter sur une zone irritée ou douloureuse. Je fais vérifier votre situation par notre équipe avant de compléter votre routine, et je vous rappelle. Si l’irritation est importante ou persiste, consultez un médecin. »'};
 if(p.severity==='severe')return{code:'severe-acne',urgent:false,followUp:true,text:'Boutons profonds, très douloureux ou laissant des cicatrices : ne pas traiter cette situation comme un simple upsell cosmétique. Orientation vers l’encadrement médical.',script:'« Des boutons profonds et douloureux méritent l’avis d’un professionnel. Je fais vérifier votre situation par notre encadrement médical avant de vous proposer un complément, et je vous rappelle. »'};
 if(p.hairPattern==='sudden'||p.hairPattern==='patchy')return{code:'hair-loss',urgent:false,followUp:true,text:'Une chute brusque, par plaques, ou associée à une douleur/plaie du cuir chevelu nécessite une évaluation professionnelle. Ne pas promettre une repousse avec un cosmétique.',script:'« Une chute brusque ou par plaques doit être évaluée par un professionnel de santé. Je ne vous promets pas de repousse avec un cosmétique ; je fais vérifier votre situation avant toute proposition et je vous rappelle. »'};
 if(p.safety.includes('minor')&&p.age==='child')return{code:'child',urgent:false,followUp:true,text:'Produit pour un enfant : faire vérifier l’âge autorisé et la formule par votre encadrement avant de proposer la gamme adulte. Ce n’est pas une urgence médicale.',script:'« Pour un enfant, je vérifie avec mon équipe l’âge d’utilisation et la formule avant de vous proposer un complément. Je vous rappelle dès que c’est fait. »'};
 if(p.safety.includes('allergy')&&p.allergens?.includes('unknown'))return{code:'unknown-allergen',urgent:false,followUp:true,text:'Allergène non identifié : vérifier l’étiquette et l’allergie avant de choisir un complément. Vérification interne, sans renvoi médical systématique.',script:'« Je vérifie la composition avec mon équipe par rapport à votre allergie avant de vous proposer un complément. Pouvez-vous retrouver le nom de l’allergène ? Je vous rappelle ensuite. »'};
 return null;
}
export function reviewReason(p:Profile):string|null{return reviewStop(p)?.text??null;}
/** The situations that stop the offer, in reviewStop order, for the Protocole page. */
export const REVIEW_SITUATIONS:[ReviewStopCode,string][]=[['urgent','Gonflement important ou réaction sévère (urgence possible)'],['irritation','Irritation active, brûlure, zone douloureuse ou rougeurs sévères'],['severe-acne','Boutons profonds, douloureux ou laissant des cicatrices'],['hair-loss','Chute de cheveux brusque ou par plaques'],['child','Produit destiné à un enfant'],['unknown-allergen','Allergie à un ingrédient non identifié']];
export function safetyNotes(p:Profile):string[]{
 const n:string[]=[];
 if(p.sensitive==='yes'||p.sensitive==='unknown'||p.concerns.includes('red')||p.concerns.includes('scalpcomfort'))n.push('Conseil prudent, pas de renvoi automatique : privilégier les formules douces documentées, sans parfum ni huiles essentielles listés. Introduire un produit à la fois et tester la tolérance.');
 if(p.safety.includes('treatment'))n.push('Demander le nom du traitement oralement. Le moteur écarte les nouveaux actifs ciblés et garde des compléments simples ; vérifier leur compatibilité sans modifier la prescription.');
 if(p.safety.includes('pregnancy'))n.push('Pas d’ajout automatique de soin ciblé ou de formule capillaire aux huiles essentielles. Des soins simples restent envisageables après vérification de l’étiquette et du protocole grossesse.');
 if(p.safety.includes('minor'))n.push('Pour un adolescent, vérifier l’âge d’utilisation indiqué. Pas d’actif ciblé ajouté automatiquement.');
 if(p.safety.includes('unknown'))n.push('Situation encore imprécise : terminer les questions avant d’introduire des actifs ; limiter les suggestions aux soins simples documentés.');
 if(p.concerns.includes('scars')||p.marks==='relief')n.push('Un cosmétique ne supprime pas une cicatrice en creux ou en relief. Hydratation et protection peuvent compléter la routine, sans promettre de corriger le relief.');
 if(p.concerns.includes('fall')&&p.hairPattern==='gradual')n.push('Chute progressive : conseil capillaire possible, sans diagnostic ni garantie de repousse. Une chute persistante ou qui s’aggrave mérite un avis professionnel.');
 if(p.concerns.includes('flakes'))n.push('Ne pas appeler des pellicules « psoriasis ». Respecter le diagnostic existant et le protocole avant les produits spécifiques.');
 if(p.safety.includes('allergy')&&!p.allergens?.includes('unknown'))n.push('Filtrage des allergènes déclarés à partir des listes publiées. Vérifier le flacon du lot avant accord ; le filtre n’est pas une garantie d’absence de réaction.');
 return n;
}
export function group(p:Product){return p.category==='Sérum hydratant'?'Soin ciblé':p.category;}
/** Shown beside a product that makes the skin more sensitive to the sun (an evening serum). */
export const NIGHT_ONLY='Soir uniquement / SPF le lendemain matin';
export const productTags=(p:Product):string[]=>p.photosensitizing?[NIGHT_ONLY]:[];
function restricted(p:Profile){return p.sensitive!=='no'||p.concerns.includes('red')||p.concerns.includes('scalpcomfort')||p.safety.some(s=>['treatment','pregnancy','minor','unknown'].includes(s))||p.concerns.includes('scars')||p.marks==='relief'||p.marks==='unknown';}
function ingredientRisk(p:Product,profile:Profile):boolean{
 const a=profile.allergens||[];const inci=(p.inciText||'').toLowerCase();
 if(!profile.safety.includes('allergy'))return false;
 if(!inci)return true;
 if(a.includes('fragrance')&&(p.fragrance!==false||p.essentialOils!==false))return true;
 if(a.includes('essential')&&p.essentialOils!==false)return true;
 if(a.includes('mi')&&/methylisothiazolinone|methylchloroisothiazolinone|kathon/.test(inci))return true;
 if(a.includes('nuts')&&/corylus|amygdalus|sesamum/.test(inci))return true;
 if(a.includes('salicylates')&&/salicylic|salicylate|geogard ect/.test(inci))return true;
 return false;
}
/** BEL.NCO: the customer said her skin already reacted to retinol. */
const retinolReacted=(base:Product,profile:Profile)=>brandOf(base)==='belnco'&&profile.retinol==='irritated';
// sharedStep: the one step a candidate may repeat from the basket (a pack upgrade passes the base's step, so a ritual's second cleanser stands beside the first).
export function canCombine(base:Product,added:Product[],candidate:Product,profile:Profile,catalogue:Product[]=[base,...added,candidate],sharedStep?:string):boolean{
 if(!candidate.enabled||(!candidate.recommendable&&!profile.verifiedProducts?.includes(candidate.id))||candidate.id===base.id||added.some(x=>x.id===candidate.id)||domainOf(candidate)!==domainOf(base))return false;
 if([candidate,...expand(candidate,catalogue)].some(p=>brandOf(p)!==brandOf(base)))return false;
 const basket=[base,...added];if(basketProblem([...basket,candidate],catalogue))return false;
 const current=basket.flatMap(p=>expand(p,catalogue)),incoming=expand(candidate,catalogue);
 if(incoming.some(p=>!p.enabled||(!p.recommendable&&!profile.verifiedProducts?.includes(p.id))))return false;
 if(['shpso','serumpso','packpso'].includes(candidate.id)&&!profile.scalpProtocol)return false;
 if(candidate.id==='sal10'&&!profile.verifiedProducts?.includes('sal10'))return false;
 if(candidate.verificationRequired&&!profile.verifiedProducts?.includes(candidate.id))return false;
 if(retinolReacted(base,profile)&&incoming.some(p=>p.id==='bel-retinol'))return false;
 for(const p of incoming){
  if(current.some(x=>group(x)===group(p))&&group(p)!==sharedStep&&!doubleCleanse(current,p))return false;
  if(profile.routine.includes(group(p)))return false;
  if(ingredientRisk(p,profile))return false;
  // After an evening serum that sensitizes to the sun, the brand's SPF stays offered to a cautious profile: no SPF is the bigger risk.
  if(restricted(profile)&&!p.gentle&&!(p.category==='Protection solaire'&&current.some(x=>x.photosensitizing)))return false;
  if(domainOf(p)==='face'){
   if(p.active&&(current.some(x=>x.active)||profile.routine.includes('Soin ciblé')||profile.skin==='unknown'))return false;
   if(p.category==='Hydratant'&&profile.skin!=='unknown'&&!p.skins.includes(profile.skin))return false;
   if(p.active&&profile.skin!=='unknown'&&!p.skins.includes(profile.skin))return false;
  }
 }
 return true;
}
export type ManualAddCheck={blocked:string|null;warnings:string[];verifyIds:string[]};
// A product the customer asks for by name, outside the suggestions. Hard rules block it (no verification overrides them);
// softer mismatches become warnings the adviser confirms. verifyIds are the references the server needs in verifiedProducts.
export function manualAddCheck(base:Product,added:Product[],candidate:Product,profile:Profile,catalogue:Product[]):ManualAddCheck{
 const stop=(blocked:string):ManualAddCheck=>({blocked,warnings:[],verifyIds:[]});
 if(!candidate.enabled)return stop('Référence désactivée.');
 if(expand(candidate,catalogue).some(p=>!p.enabled))return stop('Référence désactivée.');
 const other=[candidate,...expand(candidate,catalogue)].find(p=>brandOf(p)!==brandOf(base));
 if(other)return stop(`Référence ${BRAND_LABELS[brandOf(other)]} : elle ne s’ajoute pas à un appel ${BRAND_LABELS[brandOf(base)]}.`);
 if(candidate.id===base.id||added.some(x=>x.id===candidate.id))return stop('Déjà dans la routine.');
 const problem=basketProblem([base,...added,candidate],catalogue);if(problem)return stop(problem);
 const current=[base,...added].flatMap(p=>expand(p,catalogue)),incoming=expand(candidate,catalogue);
 if(incoming.some(p=>ingredientRisk(p,profile)))return stop('Allergie déclarée : ingrédient à risque ou liste INCI non publiée.');
 if(['shpso','serumpso','packpso'].includes(candidate.id)&&!profile.scalpProtocol)return stop('Routine spécifique : à valider d’abord par le référent de l’équipe.');
 const warnings:string[]=[],face=incoming.filter(p=>domainOf(p)==='face');
 if(retinolReacted(base,profile)&&incoming.some(p=>p.id==='bel-retinol'))warnings.push('Sa peau a déjà réagi au rétinol : à éviter ou avec grande prudence.');
 if(domainOf(candidate)!==domainOf(base))warnings.push('Autre zone que la commande initiale : besoin non évalué par le questionnaire.');
 if(incoming.some(p=>current.some(x=>group(x)===group(p))&&!doubleCleanse(current,p)||profile.routine.includes(group(p))))warnings.push('Étape déjà couverte (routine actuelle ou panier).');
 if(restricted(profile)&&incoming.some(p=>!p.gentle))warnings.push('Profil prudent : formule non signalée comme douce.');
 if(face.some(p=>p.active)&&(current.some(x=>x.active)||profile.routine.includes('Soin ciblé')))warnings.push('Un soin ciblé actif est déjà présent : éviter de superposer les actifs.');
 if(profile.skin&&profile.skin!=='unknown'&&face.some(p=>(p.category==='Hydratant'||p.active)&&!p.skins.includes(profile.skin)))warnings.push('Non indiqué pour le type de peau renseigné.');
 const unverified=[candidate,...incoming.filter(p=>p.id!==candidate.id)].filter(p=>!p.recommendable||!!p.verificationRequired);
 if(unverified.length)warnings.push('Vérification spécifique requise : '+(unverified.find(p=>p.verificationRequired)?.verificationRequired||'fiche à vérifier avant ajout.'));
 return{blocked:null,warnings,verifyIds:[...new Set(unverified.map(p=>p.id))]};
}
function reasonFor(p:Product,base:Product,profile:Profile,sun=false):string{
 const bel=brandOf(base)==='belnco';
 if(bel&&makeupBonus(p,profile.makeup))return profile.makeup==='daily'?'Elle se maquille tous les jours : le double nettoyage (huile puis gel) retire maquillage et SPF sans dessécher.':'Elle met une crème solaire tous les jours : l’huile démaquillante la retire en douceur, sans dessécher.';
 if(isPack(p))return(p.pitch||p.description)+' Son contenu est compté dans la routine pour éviter tout doublon.';
 if(domainOf(base)==='hair'){
  if(p.category==='Après-shampoing')return'Le shampoing couvre le lavage. Pour les longueurs sèches ou cassantes, l’après-shampoing ajoute le démêlage et le conditionnement qui manquent.';
  if(p.category==='Shampoing')return'Le soin déjà commandé ne remplace pas le lavage. Ajouter un shampoing adapté seulement si cette étape n’est pas déjà couverte.';
  return'Un soin de cuir chevelu est une étape différente du shampoing. Pertinent pour la demande exprimée, sans garantie de repousse et après vérification de la tolérance.';
 }
 if(p.category==='Hydratant')return'Complète le soin déjà choisi par une étape de confort et d’hydratation. '+p.description;
 if(p.category==='Protection solaire'&&sun)return'Le soin du soir choisi rend la peau plus sensible au soleil : un SPF le lendemain matin est indispensable.';
 if(p.category==='Protection solaire')return'La protection solaire manque à la routine. Une étape complémentaire à l’hydratation ou au soin éclat, pas un deuxième sérum similaire.';
 if(p.category==='Nettoyant'&&brandOf(p)==='belnco')return'Une étape lavante adaptée manque.'+(doubleCleanse([base],p)?' '+DOUBLE_CLEANSE_LINE:'');
 if(p.category==='Nettoyant')return'Une étape lavante adaptée manque. Le Total Cleanser est privilégié quand un soin ciblé est déjà présent, pour éviter de superposer les exfoliants.';
 if(p.category==='Sérum hydratant')return'Complément d’hydratation quand une crème est déjà présente et que le besoin de confort persiste, sans dupliquer un autre sérum.';
 return'Répond à la priorité « '+labelConcern(profile,base)+' ». Un seul soin ciblé, avec les ingrédients de la fiche et une tolérance à vérifier.'+(bel&&p.id==='bel-retinol'&&profile.retinol==='never'?' Commencer 2 à 3 soirs par semaine.':'');
}
export function recommend(catalogue:Product[],base:Product,profile:Profile,added:Product[]=[]):Candidate[]{
 if(!questionsReady(profile,base)||reviewReason(profile))return[];
 const primary=profile.concerns[0]==='acne'&&profile.severity==='blackheads'?'blackheads':profile.concerns[0]==='fall'&&profile.hairPattern==='breakage'?'breakage':profile.concerns[0];
 const basket=[base,...added].flatMap(p=>expand(p,catalogue)),has=(g:string)=>basket.some(x=>group(x)===g)||profile.routine.includes(g);
 const brand=brandOf(base),sun=basket.some(x=>x.photosensitizing);
 // BEL.NCO: the targeted care its priority puts first (the retinol gives way when the skin reacted to it).
 const firsts=brand==='belnco'?(BEL_TARGETED[primary]??[]).filter(id=>!(id==='bel-retinol'&&retinolReacted(base,profile))):[];
 const results:Candidate[]=[];
 for(const p of catalogue){
  if(!canCombine(base,added,p,profile,catalogue))continue;
  let score=0;
  // A face pack made only of cleansers (the BEL.NCO ritual) is offered as a cleanser.
  const step=isPack(p)&&expand(p,catalogue).every(x=>x.category==='Nettoyant')?'Nettoyant':p.category;
  if(domainOf(base)==='hair'){
   if(p.category==='Après-shampoing'&&['growth','breakage','hairdry'].some(x=>profile.concerns.includes(x)||x===primary))score=110;
   if(p.category==='Shampoing'){
    if(p.id==='shanti'&&primary==='fall'&&profile.hairPattern==='gradual')score=105;
    if(p.id==='shpousse'&&['growth','breakage','hairdry','scalpoil'].includes(primary))score=105;
   }
   if(p.id==='serumhair'&&primary==='fall'&&profile.hairPattern==='gradual')score=100;
   if(profile.scalpProtocol&&primary==='flakes'&&['shpso','serumpso'].includes(p.id))score=85;
   // Avoid a scalp serum solely for a length/cosmetic breakage concern.
  }else if(domainOf(base)==='body'){
   if(p.id==='bodywash'&&primary==='bodyspots')score=90;
   if(p.id==='bodypack'&&primary==='bodyspots')score=80;
  }else if(step==='Hydratant'){
   score=basket.some(x=>x.active)?110:60;if(['dry','dehydration','red'].includes(primary))score+=40;
   if(profile.skin==='unknown'&&p.id!==({touche:'wccream',belnco:'bel-moist'} as const)[brand])continue;
   if(p.id==='wcgel'&&['oily','mixed'].includes(profile.skin)&&profile.sensitive==='no')score+=20;
   if(p.id==='wccream'&&['normal','mixed'].includes(profile.skin))score+=15;
   if(p.id==='wcrich'&&profile.skin==='dry')score+=20;
   if(p.id==='hcream')score-=18;
  }else if(step==='Protection solaire'){
   score=has('Hydratant')?85:45;if(['marks','dull'].includes(primary))score+=45;if(p.id==='wcspf')score+=12;if(sun)score+=200;
  }else if(step==='Nettoyant'){
   score=has('Hydratant')?60:40;if(p.id==='total')score+=8;if(p.id==='gelclean'&&['oil','blackheads'].includes(primary))score+=10;
   if(brand==='belnco')score+=makeupBonus(p,profile.makeup);
  }else if(step==='Soin ciblé'){
   if(!p.concerns.includes(primary))continue;
   score=base.category==='Hydratant'?115:80;
   if(brand==='touche'){
    if(primary==='acne'&&p.id!=='antiacne'&&p.id!=='nia10')continue;
    if(primary==='acne'&&p.id==='antiacne')score+=8;
    if(primary==='blackheads'&&!['sal2','lotion'].includes(p.id))continue;
    if(primary==='blackheads'&&p.id==='sal2')score+=15;
    if(primary==='oil'&&!['nia10','nia12'].includes(p.id))continue;
    if(primary==='oil'&&p.id==='nia10')score+=10;
   }else{
    if(['acne','blackheads','oil'].includes(primary)&&p.id!=='bel-clarifying')continue;
    score+=TARGETED_BONUS[firsts.indexOf(p.id)]??0;
   }
  }else if(step==='Soin local'){
   if(primary==='acne'&&profile.severity==='mild')score=65;
  }else if(step==='Sérum hydratant'){
   if(!['dehydration','dry','red'].includes(primary)||!has('Hydratant'))continue;
   score=primary==='dehydration'?100:70;if(p.id==='sensitive'&&profile.sensitive==='yes')score+=12;
  }
  if(score>0)results.push({product:p,score:score+pairingBonus(base,p),reason:reasonFor(p,base,profile,sun)});
 }
 return results.sort((a,b)=>b.score-a.score||a.product.price-b.product.price).slice(0,12);
}
export function packUpgrades(catalogue:Product[],base:Product,profile:Profile):Candidate[]{
 if(isPack(base)||!questionsReady(profile,base)||reviewReason(profile))return[];
 return catalogue.filter(p=>p.enabled&&(p.recommendable||profile.verifiedProducts?.includes(p.id))&&isPack(p)&&p.components?.includes(base.id)&&domainOf(p)===domainOf(base)&&brandOf(p)===brandOf(base)).filter(p=>{
  const extra=expand(p,catalogue).filter(x=>x.id!==base.id);
  return extra.length>0&&extra.every(x=>canCombine(p.id==='bodypack'&&x.id==='nia10'?{...base,domain:'face'}:base,[],x,profile,catalogue,group(base)))&&p.concerns.some(c=>profile.concerns.includes(c));
 }).map(p=>({product:p,score:100,reason:p.pitch||p.description}));
}
export function summaryText(base:Product,basket:OrderItem[],tier:Tier,delivery:number|null,catalogue:Product[],initial:OrderItem[]=[base]){
 const total=itemsTotal(basket),offer=orderOffer(initial,basket,tier,catalogue),{sets}=hairPackSets(basket,catalogue),pack=basket.some(isPack)||sets.length>0,baseTotal=pricedTotal(initial,catalogue);
 const packRates=sets.map(({pack,count})=>`\nTarif pack appliqué : ${expand(pack,catalogue).map(p=>p.name).join(' + ')} = ${money(pack.price)}${count>1?` × ${count} = ${money(pack.price*count)}`:''}.`).join('');
 const fee=delivery===null?'Frais de livraison à confirmer.':`Livraison : ${money(delivery)}. Total avec livraison : ${money(offer+delivery)}.`;
 const replacement=`Commande initiale : ${initial.map(quantityLabel).join(' + ')} (${money(baseTotal)}).${basket[0]?.id!==base.id?' Remplacement par le pack ci-dessous, sans double facturation.':''}\n`;
 return `${BRAND_LABELS[brandOf(base)].toUpperCase()} | Récapitulatif de l’offre\n${replacement}${basket.map(p=>`• ${quantityLabel(p)} : ${money(lineTotal(p))}${quantityOf(p)>1?` (${money(p.price)} / unité)`:""}`).join('\n')}${packRates}\n\nTotal catalogue : ${money(total)}\nOffre produits : ${money(offer)}\nÉconomie : ${money(total-offer)}\nÉcart avec la commande initiale : ${money(offer-baseTotal)}\n${fee}\n${pack?'Tarif pack conservé, réduction uniquement sur les compléments éligibles. ':''}Offre liée à la commande en cours, sans cumul de remises. À valider avec la cliente. Aucun système de commande externe modifié.`;
}
export function goalPhrase(p:Profile):string{
 const goals:Record<string,string>={acne:'mieux prendre soin de vos petites imperfections',blackheads:'cibler les points noirs sans surcharger votre routine',oil:'limiter l’apparence de la brillance',marks:'améliorer l’apparence des marques brunes',red:'retrouver davantage de confort',dry:'réduire les sensations de tiraillement',dehydration:'mieux hydrater votre peau',dull:'retrouver un teint plus lumineux',aging:'prendre soin des ridules et de la fermeté de votre peau',scars:'améliorer l’aspect de votre peau sans promesse sur le relief des cicatrices',growth:'prendre soin de vos longueurs',breakage:'faciliter le démêlage et limiter la casse',fall:'mieux accompagner votre routine capillaire',hairdry:'retrouver des longueurs plus souples',scalpoil:'adapter le lavage à vos racines grasses',flakes:'adapter votre routine aux pellicules',scalpcomfort:'préserver le confort de votre cuir chevelu',bodyspots:'prendre soin des imperfections de votre corps',bodydry:'retrouver davantage de confort sur votre corps'};
 return goals[p.concerns[0]]||'compléter utilement votre routine';
}
export function customerBenefit(p:Product):string{
 const lines:Record<string,string>={
 wccream:'Cette crème complète l’hydratation avec de la glycérine, du panthénol et des céramides. Elle ne remplace pas votre sérum : elle apporte une étape de confort, dans une texture destinée aux peaux normales à mixtes.',
 wcgel:'Ce gel hydratant est la texture Water Complex destinée aux peaux mixtes à grasses. La glycérine, la bétaïne et l’acide hyaluronique complètent l’hydratation ; c’est un geste différent de votre soin ciblé.',
 wcrich:'Cette texture plus riche associe notamment huile de jojoba, squalane et glycérine. Elle est destinée aux peaux sèches : l’idée est d’apporter de la souplesse et du confort, plutôt que d’ajouter un deuxième sérum.',
 total:'Le Total Cleanser apporte l’étape de nettoyage qui manque. Sa formule associe une base lavante, de la glycérine et des céramides ; on complète votre routine sans ajouter un nouvel exfoliant.',
 ha35:'Ce sérum associe hyaluronate de sodium, glycérine et panthénol. Il apporte un complément d’hydratation à votre crème, si c’est bien le besoin que vous ressentez.',
 sensitive:'Ce sérum réunit glycérine, acide hyaluronique, niacinamide et panthénol. Nous vérifions sa tolérance et votre routine : le nom « peaux sensibles » ne dispense pas de cette vérification.',
 nia10:'Ce sérum associe niacinamide 10 % et Zinc PCA 1 % dans la liste publiée. C’est le soin ciblé proposé pour votre préoccupation de brillance, plutôt que d’empiler plusieurs sérums similaires.',
 antiacne:'Vous avez déjà une étape d’hydratation. Ce soin ciblé complète la routine des imperfections avec une formule contenant notamment du jojoba et du tea tree ; nous vérifions d’abord que ces ingrédients vous conviennent.',
 sal2:'L’acide salicylique 2 % est l’option ciblée proposée pour les points noirs. Nous gardons un seul exfoliant et préservons les autres gestes simples de la routine.',
 vitc:'La formule contient de l’acide ascorbique 11 %, avec de l’acide férulique et de la vitamine E. C’est l’étape éclat de la routine, sans remplacer une protection solaire.',
 wcspf:'Le SPF 50 ajoute la protection solaire qui manque à votre routine. Ce n’est pas un deuxième produit pour le même geste ; la quantité et la réapplication restent celles indiquées sur le flacon.',
 serumspf:'Cette référence apporte une protection solaire SPF 50 dans une texture sérum selon le catalogue. C’est une étape de protection, à utiliser conformément à son étiquette.',
 hcream:'La crème hydratante historique associe notamment glycérine, acide hyaluronique et huile de jojoba. C’est une option simple pour compléter l’hydratation si sa texture vous convient.',
 conditioner:'Le shampoing lave ; l’après-shampoing apporte un autre geste, le soin des longueurs et le démêlage. Sa formule contient notamment glycérine, panthénol et agents conditionnants : c’est pertinent quand les longueurs sont sèches ou cassantes.',
 shpousse:'Ce shampoing apporte l’étape de lavage, avec notamment glycérine, panthénol et kératine hydrolysée dans sa formule. L’après-shampoing s’occupe ensuite des longueurs : les deux ne font pas le même travail.',
 shanti:'Ce shampoing apporte l’étape lavante de la routine capillaire, avec notamment glycérine et kératine hydrolysée. Il complète un soin du cuir chevelu sans le remplacer.',
 serumhair:'Ce soin du cuir chevelu contient notamment des huiles de ricin et d’argan ainsi que du panthénol. Contrairement au shampoing, il prévoit un temps de pose puis un rinçage selon l’étiquette. Cela ne constitue pas une garantie de repousse.',
 bodywash:'Ce nettoyant est destiné au corps et contient notamment niacinamide et acide salicylique. Nous le proposons pour la zone concernée, en tenant compte des actifs que vous utilisez déjà.'};
 return lines[p.id]||p.pitch||p.description;
}
export function salesPitch(base:Product,basket:OrderItem[],profile:Profile,tier:Tier,catalogue:Product[],initial:OrderItem[]=[base]){
 const offer=orderOffer(initial,basket,tier,catalogue),total=itemsTotal(basket),extra=offer-pricedTotal(initial,catalogue);
 const expanded=basket.flatMap(p=>expand(p,catalogue)),initialIds=new Set(initial.flatMap(p=>expand(p,catalogue)).map(p=>p.id));
 const complements=expanded.filter(p=>!initialIds.has(p.id));
 const facts=complements.flatMap(p=>(p.ingredients||[]).slice(0,2).map(i=>`${p.short} : ${i.name}. ${i.role}`));
 const repeats=basket.filter(p=>quantityOf(p)>quantityOf(initial.find(x=>x.id===p.id)||{quantity:1})&&initial.some(x=>x.id===p.id));
 const repeatedText=repeats.map(p=>`${quantityOf(p)-quantityOf(initial.find(x=>x.id===p.id)!)} ${quantityOf(p)-quantityOf(initial.find(x=>x.id===p.id)!)>1?'unités supplémentaires':'unité supplémentaire'} de ${p.short}, selon la quantité demandée.`).join(' ');
 const why=[complements.map(customerBenefit).join(' '),repeatedText].filter(Boolean).join(' ');
 const opener=`Vous m’avez dit vouloir ${goalPhrase(profile)}. Vous avez déjà choisi ${initial.map(p=>quantityLabel({...p,name:p.short})).join(' + ')}. Je vous propose de compléter précisément ce qui manque, pas de multiplier les produits.`;
 const value=why?why:'Votre pack couvre déjà plusieurs gestes. Nous ne doublons pas ses composants.';
 const price=`L’ensemble revient à ${money(offer)}${total>offer?' au lieu de '+money(total):''}, soit ${money(extra)} ${extra<0?'de différence':'supplémentaires'} par rapport à votre commande initiale. ${total>offer?'Vous économisez '+money(total-offer)+' sur le catalogue. ':''}Les frais de livraison restent séparés.`;
 const close='Est-ce que je vous confirme cette composition et ce montant pour votre commande ?';
 return{opener,value,facts,price,close,text:[opener,value,price,close].join('\n\n')};
}
export function objections(base:Product,basket:OrderItem[],profile:Profile,tier:Tier,catalogue:Product[],initial:OrderItem[]=[base]){
 const offer=orderOffer(initial,basket,tier,catalogue),final=orderOffer(initial,basket,'final',catalogue),total=itemsTotal(basket),baseTotal=pricedTotal(initial,catalogue),extra=offer-baseTotal;
 const items=basket.flatMap(p=>expand(p,catalogue)),baseIds=new Set(initial.flatMap(p=>expand(p,catalogue)).map(p=>p.id)),p=items.find(p=>!baseIds.has(p.id));
 const proof=p?.ingredients?.slice(0,2).map(i=>`${i.name} : ${i.role}`).join(' ')||p?.pitch||'Chaque produit garde un rôle précis dans la routine.';
 return[
 {key:'budget',title:'« C’est trop cher. »',probe:'Est-ce le montant total qui vous freine, ou le supplément par rapport à votre commande initiale ?',answer:`Vous souhaitiez surtout ${goalPhrase(profile)}. ${p?customerBenefit(p):'L’objectif est de garder uniquement les gestes utiles.'} Votre commande de départ est à ${money(baseTotal)} ; avec cette composition, on passe à ${money(offer)}. Le supplément réel est donc ${money(extra)}, hors livraison.${offer>final?' Je peux aller jusqu’à l’offre finale autorisée de '+money(final)+' pour cette composition.':''}`,close:'Cette composition vous convient-elle à ce montant, en conservant tous les produits déjà commandés ?',action:'Présenter le gain utile et le supplément. Conserver tous les produits de la commande initiale. Ne pas inventer de prix ni dévaloriser la cliente.'},
 {key:'initial',title:initial.length>1?'« Je voulais seulement les produits déjà commandés. »':'« Je voulais seulement mon produit. »',probe:'Tout à fait. Puis-je vous expliquer en une phrase pourquoi je vous propose ce complément ?',answer:`${p?customerBenefit(p):'La proposition complète un geste manquant, sans doubler vos produits.'} Votre commande initiale reste possible. Mon rôle est de vous proposer une routine cohérente avec ce que vous venez de me décrire.`,close:'Ce complément vous serait-il utile, ou cette étape est-elle déjà couverte chez vous ?',action:'Une justification concrète puis une question. Un refus clair clôt la proposition.'},
 {key:'already',title:'« J’ai déjà une crème / un shampoing. »',probe:'Lequel utilisez-vous, pour quel besoin, et est-ce qu’il vous convient ?',answer:'S’il vous convient, gardons-le : acheter deux produits pour le même geste n’apporterait pas forcément plus. Je vérifie seulement l’étape manquante et la compatibilité avec votre commande.',close:'On complète uniquement ce qui manque réellement à votre routine ?',action:'Cocher le produit déjà utilisé et recalculer les suggestions ; ne pas remplacer par principe.'},
 {key:'efficacy',title:'« Est-ce que ça fonctionne vraiment ? »',probe:'Quel résultat attendez-vous précisément : confort, brillance, marques, démêlage ou autre chose ?',answer:`Voici ce qui est concret dans la formule : ${proof} Cela explique le rôle cosmétique du complément. Une liste d’ingrédients ne permet pas de garantir un résultat sur chaque personne ; je préfère vous proposer un geste cohérent et une utilisation régulière conforme à l’étiquette plutôt qu’une promesse excessive.`,close:'Est-ce bien le bénéfice que vous recherchez en priorité ?',action:'Ne pas citer de pourcentage clinique, délai de guérison ou centimètres de repousse sans preuve produit validée.'},
 {key:'reaction',title:'« J’ai peur que ma peau réagisse. »',probe:'Avez-vous une réaction actuellement, une allergie connue, ou seulement une peau qui réagit facilement ?',answer:'Une peau sensible ne signifie pas qu’il faut renoncer à toute routine. Nous pouvons privilégier une formule simple et documentée, introduire un seul nouveau produit et vérifier la tolérance. En revanche, on n’ajoute pas de soin sur une zone actuellement brûlée, gonflée ou très irritée.',close:'Je vérifie les ingrédients et vous présente l’option la plus sobre adaptée à vos réponses ?',action:'Mettre à jour sensibilité/allergènes. Pas de promesse « zéro réaction ».'},
 {key:'later',title:'« Je vais réfléchir. »',probe:'Qu’est-ce qui vous manque pour décider : comprendre le produit, son utilisation ou le montant ?',answer:`Je peux reprendre le point qui vous fait hésiter. L’offre pour cette commande est de ${money(offer)} hors livraison ; le montant et la composition restent clairement indiqués. L’objectif est que vous sachiez pourquoi chaque produit est là.`,close:'Quel point souhaitez-vous que je clarifie avant de confirmer la commande ?',action:'Répondre au frein réel, sans fausse expiration ni menace de rupture. Respecter la décision finale.'},
 {key:'many',title:'« Cela fait trop de produits. »',probe:'Préférez-vous conserver votre commande initiale sans cet ajout ?',answer:'Nous conservons tous les produits déjà commandés. Le complément reste facultatif : nous pouvons retirer le nouvel ajout et recalculer le montant. Nous évitons aussi les doublons, y compris ceux contenus dans un pack.',close:'On conserve votre commande initiale, ou ce complément vous serait-il utile ?',action:'Retirer le dernier ajout et recalculer l’offre avant de la faire accepter.'},
 {key:'discount',title:'« Faites-moi encore une remise. »',probe:'Est-ce un budget maximum à respecter ?',answer:`La meilleure offre autorisée pour cette composition est de ${money(final)}, hors livraison.${total>final?' Cela représente '+money(total-final)+' d’économie.':''} Plutôt que vous annoncer une remise qui ne sera pas appliquée, nous pouvons adapter la composition à votre budget.`,close:'Je conserve cette proposition, ou vous préférez rester sur votre commande initiale ?',action:'Pas de cumul improvisé. Tarif pack protégé ; remise seulement sur les compléments éligibles.'}
 ];
}
