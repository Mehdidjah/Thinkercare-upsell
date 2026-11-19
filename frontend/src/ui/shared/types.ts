import {type Product} from '@touche/domain';
import {type AccountUser as User} from '../AccountTable';

export type {User};
export type Call={id:string;operator:string;created_at:string;outcome:string;products:{id:string;name:string;price:number}[];base_total:number;catalogue_total:number;offered_total:number;delivery:number|null;extra:number;tier:string;pilot:number;refusal:string};
export type State={user:User;products:Product[];calls:Call[];clinical:{validated:boolean;by:string;at:string};users:User[];password_viewing_enabled?:boolean;
 /** Server capabilities (absent on servers deployed before 2026-11-19): send new fields or call new actions only when listed. */
 features?:string[];void_window_minutes?:number};
