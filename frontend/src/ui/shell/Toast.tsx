import {Icon} from '../shared/Icon';

export function Toast({toast,setToast}:{toast:string;setToast:(toast:string)=>void}){return <div role="status" className="toast"><Icon name="check" size={18}/>{toast}<button onClick={()=>setToast('')} aria-label="Fermer"><Icon name="close" size={15}/></button></div>;}
