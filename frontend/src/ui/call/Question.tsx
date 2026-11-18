import {type ReactNode} from 'react';

export function Question({n,title,phrase,note,children}:{n:string;title:string;phrase:string;note?:string;children:ReactNode}){return <section className="question" id={'question-'+n}><div className="question-number">{n}</div><div className="question-content"><h2>{title}</h2><p className="spoken">« {phrase} »</p>{note&&<p className="question-note">{note}</p>}{children}</div></section>;}
