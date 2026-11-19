import {Icon} from '../shared/Icon';

export function OfflineBanner({fatal,load}:{fatal:string;load:()=>Promise<void>}){
 return <div className="notice notice--danger shell-offline" role="alert"><Icon name="alert" className="notice__icon"/><div className="notice__text"><p>{fatal}</p></div><button type="button" className="btn btn--secondary btn--sm" onClick={()=>void load()}>Réessayer</button></div>;
}
