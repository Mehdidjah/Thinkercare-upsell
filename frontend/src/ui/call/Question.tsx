import {type ReactNode} from 'react';

export function Question({n,title,phrase,note,children}:{n:string;title:string;phrase:string;note?:string;children:ReactNode}){return <section className="call-question card" id={'question-'+n}><p className="call-question__number" aria-hidden="true">{Number(n)}</p><div className="call-question__content"><h2>{title}</h2><p className="call-say">« {phrase} »</p>{note&&<p className="call-question__note">{note}</p>}{children}</div></section>;}
