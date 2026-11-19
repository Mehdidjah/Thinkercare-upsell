import {useId,useState,type FormEvent} from 'react';
import {Icon} from '../shared/Icon';
import {Wordmark} from '../shared/Wordmark';
import {api} from '../shared/api';
import {type State} from '../shared/types';

export function Login({onSuccess}:{onSuccess:(state:State)=>void}){
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[shown,setShown]=useState(false);
 const userId=useId(),passwordId=useId(),errorId=useId();
 async function submit(e:FormEvent){e.preventDefault();setError('');setBusy(true);try{const data=await api({action:'login',username,password,bootstrap:true});onSuccess(data.bootstrap);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <main className="login">
  <div className="login-pane">
   <div className="login-pane__brand"><Wordmark size="lg"/></div>
   <div className="login-form">
    <h1>Votre espace conseil</h1>
    <p className="login-form__lead">Connectez-vous avec l’identifiant fourni par votre équipe.</p>
    <form onSubmit={submit}>
     <div className="field">
      <label className="field__label" htmlFor={userId}>Identifiant</label>
      <input id={userId} autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={e=>setUsername(e.target.value)} required placeholder="prenom.nom" aria-invalid={error?true:undefined} aria-describedby={error?errorId:undefined}/>
     </div>
     <div className="field">
      <label className="field__label" htmlFor={passwordId}>Mot de passe</label>
      <div className="login-form__password">
       <input id={passwordId} type={shown?'text':'password'} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required aria-invalid={error?true:undefined} aria-describedby={error?errorId:undefined}/>
       <button type="button" className="btn btn--ghost btn--sm login-form__toggle" aria-pressed={shown} aria-controls={passwordId} onClick={()=>setShown(v=>!v)}>Afficher</button>
      </div>
     </div>
     <p id={errorId} className="login-form__error" role="alert">{error&&<><Icon name="alert"/><span>{error}</span></>}</p>
     <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={busy}>{busy?'Connexion…':'Se connecter'}</button>
    </form>
    <p className="login-form__help">{'Mot de passe oublié ? La direction peut le réinitialiser depuis Gestion.'}</p>
   </div>
   <p className="login-pane__privacy"><Icon name="shield"/><span>Accès réservé aux équipes conseil. Aucune donnée nominative de cliente n’est demandée.</span></p>
  </div>
  <div className="login-art"><img src="/assets/scene.jpg" alt=""/></div>
 </main>;
}
