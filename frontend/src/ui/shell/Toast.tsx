import {Icon} from '../shared/Icon';

/** Interim single message (replaced by the notification system in the shared primitives step). */
export function Toast({toast,setToast}:{toast:string;setToast:(toast:string)=>void}){
 return <section className="toast-region" aria-label="Notifications"><div role="status" className="toast toast--info"><Icon name="info" className="toast__icon"/><div className="toast__text"><p className="toast__title">{toast}</p></div><button type="button" className="icon-btn" onClick={()=>setToast('')} aria-label="Fermer le message"><Icon name="close"/></button></div></section>;
}
