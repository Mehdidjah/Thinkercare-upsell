export function OfflineBanner({fatal,load}:{fatal:string;load:()=>Promise<void>}){return <div className="offline">{fatal} <button onClick={()=>void load()}>Réessayer</button></div>;}
