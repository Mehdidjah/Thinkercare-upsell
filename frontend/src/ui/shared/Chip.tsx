import {type ReactNode} from 'react';
import {Icon} from './Icon';

/** Interim toggle (aria-pressed). Single and multiple choices move to ChoiceGroup in the shared primitives step. */
export function Chip({children,selected,onClick,disabled=false}:{children:ReactNode;selected:boolean;onClick:()=>void;disabled?:boolean}){
 return <button type="button" className="chip" aria-pressed={selected} onClick={onClick} disabled={disabled}>{selected&&<Icon name="check"/>}{children}</button>;
}
