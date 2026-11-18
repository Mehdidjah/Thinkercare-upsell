import {type ReactNode} from 'react';
import {Icon} from './Icon';

export function Chip({children,selected,onClick,disabled=false}:{children:ReactNode;selected:boolean;onClick:()=>void;disabled?:boolean}){return <button type="button" className={'chip'+(selected?' selected':'')} aria-pressed={selected} onClick={onClick} disabled={disabled}>{selected&&<Icon name="check" size={14}/>} {children}</button>;}
