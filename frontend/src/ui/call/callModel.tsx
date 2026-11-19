import {createContext,useContext,type Dispatch,type SetStateAction} from 'react';
import {type domainOf,type Candidate,type ManualAddCheck,type MissingAnswer,type OrderItem,type Product,type Profile,type Proposal,type Tier} from '@touche/domain';
import {type ExampleKind} from './callState';

type Setter<T>=Dispatch<SetStateAction<T>>;
export type CallRequest={product:Product;check:ManualAddCheck;suggestion:Candidate|undefined};
/** Additions removed by a change of answers, order or verification, with « Annuler » while it still applies. */
export type RemovalNotice={id:number;names:string[];undo:(()=>void)|null};
/** The catalogue changed under the call (price or disabled product): reloaded in place, the call kept (H2). */
export type CatalogueNotice={kind:'price'|'disabled';names:string[]};

/**
 * What the guided-call screens read. The call itself is one CallDraft in Desk (App.tsx); every change goes through the
 * pure functions of callState.ts. This context only hands the current values and actions to the call components.
 */
export type CallModel={
 step:number;toStep:(n:number)=>void;
 demo:boolean;saved:boolean;busy:boolean;presenting:boolean;
 /** Outcome recorded on the server ('' while open), when, and « Annuler ce résultat » while the server allows it (H5). */
 savedOutcome:string;savedAt:string;canVoid:boolean;voidCall:(reason:string)=>Promise<string>;
 /** Starting a new call or an example and leaving it all go through the leave guard (A1). */
 newCall:()=>void;startExample:(kind:ExampleKind)=>void;exitExample:()=>void;hasParkedCall:boolean;
 orderRef:string;setOrderRef:(value:string)=>void;customerStage:string;setCustomerStage:(value:string)=>void;linkedCallId:string;
 products:Product[];visible:Product[];search:string;setSearch:Setter<string>;scope:string;setScope:Setter<string>;category:string;setCategory:Setter<string>;
 baseId:string;baseIds:string[];base:Product|undefined;initial:OrderItem[];baseTotal:number;
 /** True while the initial order may not change (offer presented, saved, or example: X10). */
 orderLocked:boolean;
 changeInitial:(ids:string[])=>void;changeInitialQuantity:(id:string,next:number)=>boolean;
 domain:ReturnType<typeof domainOf>;profile:Profile;changeProfile:(patch:Partial<Profile>)=>void;toggleConcern:(id:string)=>void;
 blocked:string|null;notes:string[];missing:MissingAnswer[];
 upgrades:Candidate[];upgrade:Product|undefined;upgradeId:string;chooseUpgrade:(id:string)=>void;clearUpgrade:()=>void;
 adds:string[];requestedIds:string[];
 verifiedProducts:string[];toggleVerified:(product:Product,checked:boolean)=>void;setDetail:Setter<Product|null>;
 candidates:Candidate[];requests:CallRequest[];requestSearch:string;setRequestSearch:Setter<string>;confirmId:string;setConfirmId:Setter<string>;
 addComplement:(id:string,verify:string[],requested:boolean)=>void;removeComplement:(id:string)=>void;changeQuantity:(id:string,next:number)=>boolean;
 basket:OrderItem[];count:number;total:number;altered:boolean;
 tier:Tier;chooseTier:(tier:Tier)=>void;offer:number;delivery:string;changeDelivery:(value:string)=>void;fee:number|null;
 copy:(text:string)=>Promise<void>;
 presented:Proposal[];matchingOffer:Proposal|undefined;presentOffer:()=>Promise<void>;handledObjections:string[];toggleObjection:(key:string)=>void;
 consent:boolean;setConsent:(value:boolean)=>void;checked:boolean;setChecked:(value:boolean)=>void;
 callbackAt:string;setCallbackAt:(value:string)=>void;refusal:string;setRefusal:(value:string)=>void;
 /** Saves an outcome; « Sans réponse » and « Conserver la commande initiale » ask first (A2). */
 record:(outcome:string)=>Promise<void>;
 removal:RemovalNotice|null;dismissRemoval:()=>void;
 catalogueNotice:CatalogueNotice|null;dismissCatalogueNotice:()=>void;
};

export const CallModelContext=createContext<CallModel|null>(null);

export function useCall():CallModel{
 const call=useContext(CallModelContext);
 if(!call)throw new Error('useCall must be used inside <CallModelContext value={…}>.');
 return call;
}
