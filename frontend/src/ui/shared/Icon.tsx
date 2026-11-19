import {type ReactNode} from 'react';

/** One stroke icon set on a 24px grid. Icons are decorative: the control beside them carries the name. */
const PATHS:Record<string,ReactNode>={
 call:<path d="M7 3H4a1 1 0 0 0-1 1c0 9 8 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2c-3-1-6-4-7-7l2-2-2-5Z"/>,
 grid:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
 chart:<path d="M4 3v17h17M8 16v-5M13 16V7M18 16V4"/>,
 trend:<><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></>,
 coins:<><ellipse cx="9" cy="6.5" rx="6" ry="3"/><path d="M3 6.5v4c0 1.66 2.69 3 6 3s6-1.34 6-3v-4"/><path d="M9 13.5v4c0 1.66 2.69 3 6 3s6-1.34 6-3v-4c0-1.4-1.9-2.6-4.5-2.9"/></>,
 route:<><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16"/></>,
 sliders:<><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></>,
 user:<><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
 book:<path d="M12 5v16M3 4c4-2 6-1 9 1 3-2 5-3 9-1v15c-4-2-6-1-9 1-3-2-5-3-9-1Z"/>,
 settings:<><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/></>,
 plus:<path d="M12 5v14M5 12h14"/>,
 minus:<path d="M5 12h14"/>,
 close:<path d="m6 6 12 12M18 6 6 18"/>,
 check:<path d="m5 12 4 4L19 6"/>,
 arrow:<path d="M4 12h16m-6-6 6 6-6 6"/>,
 back:<path d="M20 12H4m6-6-6 6 6 6"/>,
 'chevron-down':<path d="m6 9 6 6 6-6"/>,
 search:<><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></>,
 shield:<><path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z"/><path d="m8 12 3 3 5-6"/></>,
 copy:<><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></>,
 export:<path d="M12 2v13m-5-5 5 5 5-5M3 16v5h18v-5"/>,
 logout:<path d="M9 3H3v18h6M8 12h13m-5-5 5 5-5 5"/>,
 lock:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/></>,
 spark:<path d="m12 3 2 7 7 2-7 2-2 7-2-7-7-2 7-2Z"/>,
 info:<><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.01"/></>,
 alert:<><path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4v.01"/></>,
 clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
 message:<path d="M4 5h16v11H9l-5 4V5Z"/>,
 'cloud-check':<><path d="M7 18a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9H7Z"/><path d="m9.5 13 2 2 3.5-4"/></>,
 'cloud-off':<><path d="M3 3l18 18M8.6 8.2A5 5 0 0 0 7 18h10.5M20.6 16.4A4.5 4.5 0 0 0 18 9a6 6 0 0 0-7.6-4.9"/></>,
 more:<><circle cx="5" cy="12" r="1.25"/><circle cx="12" cy="12" r="1.25"/><circle cx="19" cy="12" r="1.25"/></>,
 eye:<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
 calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></>,
 filter:<path d="M4 5h16l-6 8v6l-4-2v-4L4 5Z"/>,
 external:<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>,
 refresh:<><path d="M20 11a8 8 0 0 0-14.9-3.9L4 9"/><path d="M4 4v5h5M4 13a8 8 0 0 0 14.9 3.9L20 15"/><path d="M20 20v-5h-5"/></>,
};

export function Icon({name,size=20,className}:{name:string;size?:number;className?:string}){
 return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{PATHS[name]||PATHS.info}</svg>;
}
