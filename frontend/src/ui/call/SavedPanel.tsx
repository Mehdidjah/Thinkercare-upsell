import {useId,useState,type FormEvent} from 'react';
import {OUTCOMES,REASONS} from '@touche/domain';
import {Icon} from '../shared/Icon';
import {Dialog} from '../shared/Dialog';
import {useCall} from './callModel';

const time=(iso:string)=>{const d=new Date(iso);return Number.isNaN(d.getTime())?'':d.toLocaleTimeString('fr-FR',{timeZone:'Africa/Algiers',hour:'2-digit',minute:'2-digit'});};
const when=(local:string)=>{const d=new Date(local+':00+01:00');return Number.isNaN(d.getTime())?local:d.toLocaleString('fr-FR',{timeZone:'Africa/Algiers',weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});};

/** What was recorded, in words matching the outcome. */
function savedDetail(outcome:string,refusal:string,callbackAt:string):string{
 if(['duo','trio','routine'].includes(outcome))return 'Ajout accepté tracé dans le pilotage interne. Mettez à jour la commande dans votre système.';
 if(outcome==='initial')return 'Commande initiale conservée, sans ajout.';
 if(outcome==='refused')return `Refus d’ajout tracé${refusal?`, motif : ${(REASONS[refusal]||refusal).toLowerCase()}`:''}.`;
 if(outcome==='review')return 'Orientation enregistrée : la vérification ciblée est tracée.';
 if(outcome==='noanswer')return 'Cliente non jointe : l’appel est tracé sans réponse.';
 if(outcome==='callback')return callbackAt?`Rappel prévu ${when(callbackAt)}.`:'Rappel prévu.';
 return 'Résultat tracé dans le pilotage interne.';
}

/** One panel for every step once the outcome is saved (A2): what was recorded, « Commencer le suivant »,
 *  and « Annuler ce résultat » while the server still lets the adviser void it (H5). */
export function SavedPanel(){const {saved,demo,savedOutcome,savedAt,refusal,callbackAt,newCall,canVoid}=useCall();
 const [voiding,setVoiding]=useState(false);
 if(!saved||demo)return null;
 return <section className="notice notice--success call-saved" aria-labelledby="call-saved-title">
  <Icon name="check" className="notice__icon"/>
  <div className="notice__text" role="status"><p className="notice__title" id="call-saved-title">Appel enregistré : {OUTCOMES[savedOutcome]||'résultat enregistré'}{savedAt&&time(savedAt)?` à ${time(savedAt)}`:''}.</p><p>{savedDetail(savedOutcome,refusal,callbackAt)}</p></div>
  {canVoid&&<button type="button" className="btn btn--ghost btn--sm" onClick={()=>setVoiding(true)}>Annuler ce résultat</button>}
  <button type="button" className="btn btn--primary btn--sm" onClick={newCall}>Commencer le suivant<Icon name="arrow"/></button>
  {voiding&&<VoidDialog onClose={()=>setVoiding(false)}/>}
 </section>;
}

/** Why the outcome is voided (3 to 300 characters, kept in the audit trail), then the call reopens to record the right one. */
function VoidDialog({onClose}:{onClose:()=>void}){const {savedOutcome,voidCall}=useCall();
 const titleId=useId(),fieldId=useId(),errorId=useId();
 const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const ready=reason.trim().length>=3;
 async function submit(event:FormEvent){event.preventDefault();if(!ready||busy)return;setBusy(true);setError('');const problem=await voidCall(reason.trim());setBusy(false);if(problem)setError(problem);else onClose();}
 return <Dialog open onClose={onClose} labelledBy={titleId}>
  <form onSubmit={submit}>
   <div className="dialog__head"><h2 id={titleId} className="dialog__title" data-dialog-title tabIndex={-1}>Annuler le résultat « {OUTCOMES[savedOutcome]||savedOutcome} » ?</h2><button type="button" className="icon-btn dialog__close" aria-label="Fermer" onClick={onClose}><Icon name="close"/></button></div>
   <div className="dialog__body">
    <p>Le résultat reste visible dans le journal, marqué annulé, et ne compte plus dans les chiffres ni la prime. L’appel est ensuite rouvert pour enregistrer le bon résultat.</p>
    <div className="field"><label className="field__label" htmlFor={fieldId}>Motif de l’annulation</label><textarea id={fieldId} value={reason} onChange={e=>setReason(e.target.value)} minLength={3} maxLength={300} required data-autofocus placeholder="Ex. mauvais dossier, résultat saisi par erreur" aria-invalid={error?true:undefined} aria-describedby={error?errorId:undefined}/></div>
    {error&&<p id={errorId} className="notice notice--danger" role="alert"><Icon name="alert" className="notice__icon"/><span className="notice__text">{error}</span></p>}
   </div>
   <div className="dialog__actions"><button type="button" className="btn btn--secondary" onClick={onClose}>Garder le résultat</button><button type="submit" className="btn btn--danger" disabled={!ready||busy}>{busy?'Annulation…':'Annuler ce résultat'}</button></div>
  </form>
 </Dialog>;
}
