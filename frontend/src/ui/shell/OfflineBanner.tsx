import {Icon} from '../shared/Icon';
import {Wordmark} from '../shared/Wordmark';

/** Inside the shell: the browser went offline (until it is back online), or the last workspace reload failed. */
export function OfflineBanner({fatal,offline=false,load}:{fatal:string;offline?:boolean;load:()=>Promise<void>}){
 return <div className="notice notice--danger shell-offline" role="alert"><Icon name="alert" className="notice__icon"/><div className="notice__text"><p>{offline?'Connexion perdue : votre saisie est conservée. Vérifiez le réseau ; les enregistrements reprendront au retour de la connexion.':fatal}</p></div>{!offline&&<button type="button" className="btn btn--secondary btn--sm" onClick={()=>void load()}>Réessayer</button>}</div>;
}

/** Startup failed for another reason than a missing session (B2): no login form, since signing in again would not help. */
export function ConnectionScreen({message,retry}:{message:string;retry:()=>void}){
 return <main className="shell-error"><div className="shell-error__card"><Wordmark size="lg"/><h1>Connexion impossible</h1><p role="alert">{message}</p><button type="button" className="btn btn--primary" onClick={retry}>Réessayer</button></div></main>;
}

/** Another account signed in from another tab (X1): this tab sends nothing more; its call stays in this tab for its owner. */
export function AccountChangedScreen(){
 return <main className="shell-error"><div className="shell-error__card"><Wordmark size="lg"/><h1>Ce poste est maintenant connecté avec un autre compte</h1><p>Un autre compte s’est connecté dans un autre onglet. Rien ne sera plus envoyé depuis cet onglet avec l’ancien compte. Un appel en cours reste gardé dans cet onglet et reprendra quand son compte se reconnectera ici.</p><button type="button" className="btn btn--primary" onClick={()=>window.location.reload()}>Recharger la page</button></div></main>;
}
