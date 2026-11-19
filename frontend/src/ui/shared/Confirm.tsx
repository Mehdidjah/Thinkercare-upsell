import {createContext,useCallback,useContext,useId,useState,type ReactNode} from 'react';
import {Dialog} from './Dialog';

export type ConfirmOptions={title:string;body:ReactNode;confirmLabel:string;cancelLabel:string;tone?:'danger'|'primary'};
type Confirm=(options:ConfirmOptions)=>Promise<boolean>;
const ConfirmContext=createContext<Confirm>(async()=>false);
/** Ask before an irreversible or call-ending action (§5.13). Resolves true only on the confirm button. */
export const useConfirm=()=>useContext(ConfirmContext);

/** Replaces window.confirm: the safe option comes first, sits on the left and has focus; Escape is « cancel ». */
export function ConfirmProvider({children}:{children:ReactNode}){
 const [request,setRequest]=useState<(ConfirmOptions&{resolve:(ok:boolean)=>void})|null>(null);
 const confirm=useCallback<Confirm>(options=>new Promise<boolean>(resolve=>setRequest(previous=>{previous?.resolve(false);return {...options,resolve};})),[]);
 const done=(ok:boolean)=>{request?.resolve(ok);setRequest(null);};
 const titleId=useId();
 return <ConfirmContext value={confirm}>
  {children}
  {request&&<Dialog open onClose={()=>done(false)} labelledBy={titleId} variant="confirm">
   <h2 id={titleId} className="dialog__title" data-dialog-title tabIndex={-1}>{request.title}</h2>
   <div className="dialog__body">{typeof request.body==='string'?<p>{request.body}</p>:request.body}</div>
   <div className="dialog__actions">
    <button type="button" className="btn btn--secondary" data-autofocus onClick={()=>done(false)}>{request.cancelLabel}</button>
    <button type="button" className={request.tone==='primary'?'btn btn--primary':'btn btn--danger'} onClick={()=>done(true)}>{request.confirmLabel}</button>
   </div>
  </Dialog>}
 </ConfirmContext>;
}
