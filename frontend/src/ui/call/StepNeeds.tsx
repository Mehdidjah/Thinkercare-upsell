import {Fragment} from 'react';
import {SKINS,HAIR_TYPES,SIGNALS,ALLERGENS,CONCERNS,questionsReady,concernsFor,routinesFor,brandOf} from '@touche/domain';
import {Icon} from '../shared/Icon';
import {ChoiceGroup} from '../shared/ChoiceGroup';
import {useCall} from './callModel';
import {Question} from './Question';
import {AdviceStatus} from './AdviceStatus';
import {reveal} from './reveal';

const options=(list:string[][])=>list.map(([id,label])=>({id,label}));
const SEVERITY=[['mild','Petits boutons / imperfections'],['blackheads','Surtout des points noirs'],['severe','Profonds, très douloureux ou cicatrisants']];
const MARKS=[['flat','Traces de couleur, sans relief'],['relief','Creux ou relief'],['unknown','À préciser']];
const REDNESS=[['mild','Légères / occasionnelles, sans douleur'],['severe','Brûlure, douleur, gonflement ou lésion']];
const FALL=[['breakage','Casse des longueurs'],['gradual','Chute progressive, sans douleur'],['sudden','Chute brusque / importante'],['patchy','Par plaques, avec douleur ou lésion']];
const SENSITIVITY=[['no','Pas particulièrement sensible'],['yes','Sensible, sans réaction actuelle'],['unknown','Je ne sais pas']];
const AGES=[['teen','Adolescent (12 à 17 ans)'],['child','Enfant de moins de 12 ans']];
const RETINOL=[['never','Jamais'],['tolerated','Oui, bien toléré'],['irritated','Oui, mais ma peau a réagi']];
const MAKEUP=[['daily','Maquillage tous les jours'],['spf','Crème solaire seulement'],['none','Ni l’un ni l’autre']];
const NO_ROUTINE='none';

/** Step 02 · Besoin de la cliente: the questionnaire. Single choices are radio groups, multiple choices checkboxes that say
 *  so; choosing an exclusive answer says what it cleared (F5). Re-tapping an answer changes nothing; a real change keeps the
 *  additions still allowed (A3). A targeted stop opens the check at once, whatever is left unanswered (MEDREADY).
 *  A BEL.NCO call has its own priorities, the retinol after « Rides et fermeté » and makeup as question 03 (routine 04,
 *  safety 05, as missingAnswers numbers them). A priority it doesn't offer, kept from a Touché call, stays shown so it can
 *  be removed. Read-only once the outcome is saved. */
export function StepNeeds(){const {toStep,saved,base,domain,profile,changeProfile,toggleConcern,blocked,stop,notes,missing}=useCall();
 const hair=domain==='hair',bel=brandOf(base)==='belnco',ready=questionsReady(profile,base);
 const offered=concernsFor(base),concerns=bel?[...offered,...CONCERNS.filter(c=>profile.concerns.includes(c[0])&&!offered.some(o=>o[0]===c[0]))]:offered;
 const routine=profile.routineKnown&&!profile.routine.length?[NO_ROUTINE]:profile.routine;
 return <>
  <Question n="01" title="La priorité de la cliente" phrase={hair?"Qu’aimeriez-vous améliorer en priorité sur vos cheveux ou votre cuir chevelu ?":domain==='body'?"Sur quelle zone et pour quel besoin souhaitez-vous ce soin corporel ?":"Qu’aimeriez-vous améliorer en priorité sur votre peau ?"} note="Une priorité et, si utile, une seconde préoccupation.">
   <div className="choice-group choice-group--concerns" role="group" aria-labelledby="question-01-title" aria-describedby="concerns-hint"><p id="concerns-hint" className="choice-group__hint"><Icon name="check" size={16}/>Plusieurs choix possibles : deux au plus, un troisième remplace le second.</p><div className="choice-group__options">{concerns.map(([id,label,desc])=>{const rank=profile.concerns.indexOf(id);return <button type="button" key={id} className="option option--concern" data-kind="multi" disabled={saved} onClick={()=>toggleConcern(id)} aria-pressed={rank>=0}><span className="option__indicator" aria-hidden="true"><Icon name="check"/></span><span className="option__body"><span className="option__title">{label}</span><span className="option__desc">{desc}</span></span>{rank>=0&&<span className="option__rank"><span className="option__rank-n">{rank+1}</span>{rank===0?'Priorité':'Seconde'}</span>}</button>;})}</div></div>
   {profile.concerns.includes('acne')&&<div className="call-followup"><ChoiceGroup kind="single" name="severity" legend="Quels boutons ?" options={options(SEVERITY)} value={profile.severity} disabled={saved} onChange={v=>changeProfile({severity:v})}/></div>}
   {profile.concerns.includes('marks')&&<div className="call-followup"><ChoiceGroup kind="single" name="marks" legend="Quelle marque ?" options={options(MARKS)} value={profile.marks} disabled={saved} onChange={v=>changeProfile({marks:v})}/></div>}
   {profile.concerns.includes('red')&&<div className="call-followup"><ChoiceGroup kind="single" name="red-state" legend="Rougeurs légères ou réaction active ?" options={options(REDNESS)} value={profile.redState||''} disabled={saved} onChange={v=>changeProfile({redState:v})}/></div>}
   {bel&&profile.concerns.includes('aging')&&<div className="call-followup"><ChoiceGroup kind="single" name="retinol" legend="Avez-vous déjà utilisé du rétinol ?" options={options(RETINOL)} value={profile.retinol||''} disabled={saved} onChange={v=>changeProfile({retinol:v})}/></div>}
   {profile.concerns.includes('fall')&&<div className="call-followup"><p className="call-say">« Les cheveux cassent-ils sur les longueurs, ou tombent-ils à la racine ? Est-ce soudain ou par plaques ? »</p><ChoiceGroup kind="single" name="hair-pattern" legend="Préciser la chute" options={options(FALL)} value={profile.hairPattern||''} disabled={saved} onChange={v=>changeProfile({hairPattern:v})}/></div>}
  </Question>
  <Question n="02" title={hair?'Le profil capillaire':'La peau, au quotidien'} phrase={hair?"Vos racines sont-elles grasses ? Vos longueurs sont-elles sèches ou cassantes ?":"Votre peau brille-t-elle, tiraille-t-elle, ou les deux selon les zones ?"}>
   <ChoiceGroup kind="single" name="skin" legend={hair?'Le profil capillaire':'Le type de peau'} legendHidden className="choice-group--compact" options={options(hair?HAIR_TYPES:SKINS)} value={profile.skin} disabled={saved} onChange={v=>changeProfile({skin:v})}/>
   <div className="call-followup"><ChoiceGroup kind="single" name="sensitive" legend={hair?'Sensibilité du cuir chevelu':'Sensibilité habituelle'} hint="Un seul choix. Une sensibilité habituelle ne bloque pas à elle seule le conseil." options={options(SENSITIVITY)} value={profile.sensitive} disabled={saved} onChange={v=>changeProfile({sensitive:v})}/></div>
  </Question>
  {bel&&<Question n="03" title="Maquillage et protection solaire" phrase="Vous maquillez-vous ou mettez-vous une crème solaire tous les jours ?">
   <ChoiceGroup kind="single" name="makeup" legend="Maquillage et protection solaire" legendHidden className="choice-group--compact" options={options(MAKEUP)} value={profile.makeup||''} disabled={saved} onChange={v=>changeProfile({makeup:v})}/>
  </Question>}
  <Question n={bel?'04':'03'} title="Ce qu’elle utilise déjà" phrase="Quels soins utilisez-vous actuellement et tolérez-vous bien ?" note="Tous les produits déjà commandés et les composants des packs sont pris en compte.">
   <ChoiceGroup kind="multi" name="routine" legend="Soins déjà utilisés" legendHidden className="choice-group--compact" options={[...options(routinesFor(base)),{id:NO_ROUTINE,label:'Aucun soin adapté',exclusive:true}]} value={routine} disabled={saved} onChange={v=>changeProfile(v.includes(NO_ROUTINE)?{routineKnown:true,routine:[]}:{routineKnown:v.length>0,routine:v})}/>
  </Question>
  <Question n={bel?'05':'04'} title="Les précautions utiles" phrase="Y a-t-il une réaction actuelle, une allergie connue, un traitement ou une situation particulière à prendre en compte ?" note="Le moteur adapte les produits. Il ne renvoie pas systématiquement vers un médecin.">
   <ChoiceGroup kind="multi" name="safety" legend="Précautions" legendHidden className="choice-group--compact" options={SIGNALS.map(([id,label])=>({id,label,exclusive:id==='none'||undefined}))} value={profile.safety} disabled={saved} onChange={v=>changeProfile({safety:v})}/>
   {profile.safety.includes('allergy')&&<div className="call-followup"><ChoiceGroup kind="multi" name="allergens" legend="À quoi la cliente est-elle allergique ?" className="choice-group--compact" options={options(ALLERGENS)} value={profile.allergens||[]} disabled={saved} onChange={v=>changeProfile({allergens:v})}/></div>}
   {profile.safety.includes('minor')&&<div className="call-followup"><ChoiceGroup kind="single" name="age" legend="Âge d’utilisation à vérifier" options={options(AGES)} value={profile.age||''} disabled={saved} onChange={v=>changeProfile({age:v})}/></div>}
  </Question>
  {(blocked||notes.length>0||ready)&&<AdviceStatus blocked={blocked} stop={stop} notes={notes}/>}
  <div className="call-actions"><button type="button" className="btn btn--ghost call-actions__back" onClick={()=>toStep(0)}><Icon name="back"/>Commande initiale</button>
   {blocked
    ?<p className="call-actions__status">Vérification nécessaire : les autres questions ne sont plus utiles pour cet appel.</p>
    :missing.length>0&&<p className="call-missing" role="status">Pour construire la routine, répondez à : {missing.map((m,i)=><Fragment key={m.label}>{i>0&&', '}<button type="button" className="link-btn call-missing__link" onClick={()=>reveal(document.getElementById('question-'+m.question))}>{m.label}</button></Fragment>)}</p>}
   <button type="button" className="btn btn--primary" disabled={!blocked&&!ready} onClick={()=>toStep(2)}>{blocked?'Voir la vérification':'Construire la routine'}<Icon name="arrow"/></button></div>
 </>;
}
