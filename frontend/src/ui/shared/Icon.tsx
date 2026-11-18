import {type ReactNode} from 'react';

export function Icon({name,size=20}:{name:string;size?:number}){const paths:Record<string,ReactNode>={
 call:<><path d="M7 3H4a1 1 0 0 0-1 1c0 9 8 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2c-3-1-6-4-7-7l2-2-2-5Z"/></>,
 grid:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
 chart:<><path d="M4 3v17h17M8 16v-5M13 16V7M18 16V4"/></>,
 book:<><path d="M12 5v16M3 4c4-2 6-1 9 1 3-2 5-3 9-1v15c-4-2-6-1-9 1-3-2-5-3-9-1Z"/></>,
 settings:<><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/></>,
 plus:<path d="M12 5v14M5 12h14"/>,close:<path d="m6 6 12 12M18 6 6 18"/>,check:<path d="m5 12 4 4L19 6"/>,arrow:<path d="M4 12h16m-6-6 6 6-6 6"/>,search:<><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></>,shield:<><path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z"/><path d="m8 12 3 3 5-6"/></>,copy:<><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></>,export:<><path d="M12 2v13m-5-5 5 5 5-5M3 16v5h18v-5"/></>,logout:<><path d="M9 3H3v18h6M8 12h13m-5-5 5 5-5 5"/></>,lock:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/></>,spark:<><path d="m12 3 2 7 7 2-7 2-2 7-2-7-7-2 7-2Z"/></>,back:<path d="M20 12H4m6-6-6 6 6 6"/>,info:<><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/></>};return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.info}</svg>;}
