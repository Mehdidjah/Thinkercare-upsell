import {domainOf,isPack,type Product} from './core.js';
export type CataloguePath={purpose:string;questions:string[];complements:string[];checks:string[];mode:string};
// Every reference has a documented entry route. A missing formula is never fabricated.
export function cataloguePath(p:Product,all:Product[]):CataloguePath{
 const domain=domainOf(p),checks:string[]=[],questions=domain==='hair'?['Distinguer casse des longueurs et chute à la racine.','Vérifier les produits déjà utilisés et la tolérance du cuir chevelu.']:domain==='body'?['Préciser la zone d’application et le besoin.','Vérifier les soins utilisés sur cette même zone.']:['Préciser la priorité, le type de peau et la sensibilité.','Identifier les étapes déjà couvertes dans la routine.'];
 let ids:string[]=[];
 if(domain==='face'){
  if(['Soin ciblé','Soin local'].includes(p.category))ids=['wccream','wcgel','wcrich','wcspf','total'];
  else if(p.category==='Hydratant')ids=['antiacne','nia10','vitc','ha35','total','wcspf'];
  else if(p.category==='Sérum hydratant')ids=['wccream','wcgel','wcrich','wcspf','total'];
  else if(p.category==='Nettoyant')ids=['wcgel','wccream','wcrich','nia10','wcspf'];
  else if(p.category==='Protection solaire')ids=['wccream','wcgel','wcrich','total'];
 }else if(domain==='hair'){
  ids=p.category==='Après-shampoing'?['shpousse','shanti']:p.category==='Soin cuir chevelu'?['shanti','shpousse','conditioner']:['conditioner','serumhair'];
  if(isPack(p))ids=['conditioner','shpousse','shanti','serumhair'];
 }else {ids=['bodywash','nia10','bodypack'];questions.push('Une routine visage ne doit pas être transposée au corps sans indication adaptée.');}
 const components=new Set([p.id,...(p.components||[])]);ids=ids.filter(id=>!components.has(id)&&all.some(x=>x.id===id&&x.enabled));
 if(p.verificationRequired)checks.push(p.verificationRequired);
 if(p.id==='sal10')checks.push('Ne pas proposer du salicylique 10 % comme alternative automatique au 2 %. L’usage exact, la zone et le protocole doivent être vérifiés en interne.');
 if(isPack(p)&&!p.components?.length)checks.push('Le contenu exact et l’âge autorisé de ce pack doivent être renseignés avant d’ajouter une autre référence. Ne pas improviser les composants.');
 if(p.id==='spray')checks.push('Suivre l’étiquette. Ne pas pulvériser directement au visage ni inhaler.');
 if(p.id==='packjunior')ids=[];
 return{purpose:p.pitch||p.description,questions,complements:ids,checks,mode:checks.length?'Parcours avec vérification ciblée':'Parcours automatique contextuel'};
}
