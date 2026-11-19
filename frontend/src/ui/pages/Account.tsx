import {useId,useState,type FormEvent} from 'react';
import {accountRoleLabel} from '@touche/domain';
import {NewPasswordField} from '../AccountPassword';
import {Icon} from '../shared/Icon';
import {api} from '../shared/api';
import {type State} from '../shared/types';

/** Mon compte (§6.6): every role changes its own password here. Errors stay next to the field. */
export function Account({state,reload}:{state:State;reload:()=>Promise<void>}){
 const [current,setCurrent]=useState(''),[next,setNext]=useState(''),[confirmNext,setConfirmNext]=useState(''),[working,setWorking]=useState(false),[saved,setSaved]=useState(false),[mismatch,setMismatch]=useState(false),[error,setError]=useState('');
 const confirmId=useId(),mismatchId=useId();
 async function submit(e:FormEvent){
  e.preventDefault();setSaved(false);setError('');
  if(next!==confirmNext){setMismatch(true);document.getElementById(confirmId)?.focus();return;}
  setMismatch(false);setWorking(true);
  try{await api({action:'password',current,next});await reload();setCurrent('');setNext('');setConfirmNext('');setSaved(true);}
  catch(cause){setError((cause as Error).message);}
  finally{setWorking(false);}
 }
 return <div className="admin">
  <div className="page-head"><div><h1 tabIndex={-1}>Mon compte</h1><p>{state.user.label}, {accountRoleLabel(state.user.role)}. Votre mot de passe de connexion à ThinkerCare.</p></div></div>
  <section className="card admin-section" aria-labelledby="account-password-title">
   <h2 id="account-password-title">Changer mon mot de passe</h2>
   <p>Enregistrez votre nouveau mot de passe pour l’utiliser lors de vos prochaines connexions. Les autres sessions sont déconnectées.</p>
   {state.user.role!=='admin'&&<p>La direction et les managers peuvent consulter et remplacer le mot de passe de ce compte. Choisissez un mot de passe réservé à ThinkerCare.</p>}
   <form className="admin-form admin-form--stack" onSubmit={submit}>
    <label className="field">Mot de passe actuel<input type="password" value={current} onChange={e=>setCurrent(e.target.value)} required maxLength={200} disabled={working} autoComplete="current-password"/></label>
    <NewPasswordField value={next} onChange={v=>{setNext(v);setSaved(false);setMismatch(false);}} disabled={working}/>
    <div className="field">
     <label className="field__label" htmlFor={confirmId}>Confirmer le nouveau mot de passe</label>
     <input id={confirmId} type="password" value={confirmNext} onChange={e=>{setConfirmNext(e.target.value);setMismatch(false);}} required maxLength={200} disabled={working} autoComplete="new-password" aria-invalid={mismatch||undefined} aria-describedby={mismatchId}/>
     <p className="field__error" id={mismatchId}>{mismatch&&<><Icon name="alert" size={16}/>Les deux nouveaux mots de passe diffèrent. Saisissez le même mot de passe.</>}</p>
    </div>
    {error&&<p className="notice notice--danger" role="alert"><Icon name="alert" className="notice__icon"/><span className="notice__text">{error} Votre saisie est conservée ; réessayez.</span></p>}
    <div className="admin-form__submit"><button type="submit" className="btn btn--primary" disabled={working}>{working?'Enregistrement…':'Enregistrer le mot de passe'}</button></div>
   </form>
   <p className="sr-only" role="status">{saved?'Mot de passe enregistré.':''}</p>
   {saved&&<p className="notice notice--success"><Icon name="check" className="notice__icon"/><span className="notice__text">Mot de passe enregistré. Utilisez ce nouveau mot de passe à votre prochaine connexion.</span></p>}
  </section>
 </div>;
}
