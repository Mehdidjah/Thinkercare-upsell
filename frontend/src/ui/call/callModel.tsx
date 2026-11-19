import {createContext,useContext,type Dispatch,type SetStateAction} from 'react';
import {type domainOf,type Candidate,type ManualAddCheck,type MissingAnswer,type OrderItem,type Product,type Profile,type Proposal,type ReviewStop,type Tier} from '@touche/domain';
import {type ExampleKind} from './callState';

type Setter<T>=Dispatch<SetStateAction<T>>;
/** A row of the step-3 picker. An added product keeps its row (« Ajouté ✓ · Retirer », B5); its check ignores itself. */
export type CallRequest={product:Product;check:ManualAddCheck;suggestion:Candidate|undefined;added:boolean};
/** Additions removed by a change of answers, order or verification, with « Annuler » while it still applies. */
export type RemovalNotice={id:number;names:string[];undo:(()=>void)|null};
/** The catalogue changed under the call (price or disabled product): reloaded in place, the call kept (H2). */
export type CatalogueNotice={kind:'price'|'disabled';names:string[]};
/** A copy the browser refused: the text is shown in a dialog to select by hand (COPY). */
export type CopyFallback={text:string;label:string};

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
 products:Product[];visible:Product[];
 /** Step 0 found nothing exact: the closest products (SEARCH). */
 nearby:Product[];search:string;setSearch:Setter<string>;scope:string;setScope:Setter<string>;category:string;setCategory:Setter<string>;
 baseId:string;baseIds:string[];base:Product|undefined;initial:OrderItem[];baseTotal:number;
 /** True while the initial order may not change (offer presented, saved, or example: X10). */
 orderLocked:boolean;
 changeInitial:(ids:string[])=>void;changeInitialQuantity:(id:string,next:number)=>boolean;
 /** A product of the initial order already inside one of its packs (DUPPACK). */
 duplicate:{pack:Product;product:Product}|null;
 domain:ReturnType<typeof domainOf>;profile:Profile;changeProfile:(patch:Partial<Profile>)=>void;toggleConcern:(id:string)=>void;
 /** The targeted stop: its reason (blocked), the script for that reason, urgency and whether a callback is promised (MEDSCRIPT, MEDCB). */
 blocked:string|null;stop:ReviewStop|null;notes:string[];missing:MissingAnswer[];
 upgrades:Candidate[];
 /** Official packs hidden because products were added: available again once they are removed (PACK). */
 heldPacks:Product[];upgrade:Product|undefined;upgradeId:string;chooseUpgrade:(id:string)=>void;clearUpgrade:()=>void;
 adds:string[];requestedIds:string[];
 verifiedProducts:string[];toggleVerified:(product:Product,checked:boolean)=>void;setDetail:Setter<Product|null>;
 candidates:Candidate[];requests:CallRequest[];
 /** No exact match for the picker search: `requests` holds the closest products instead (SEARCH). */
 requestApproximate:boolean;requestSearch:string;setRequestSearch:Setter<string>;confirmId:string;setConfirmId:Setter<string>;
 addComplement:(id:string,verify:string[],requested:boolean)=>void;removeComplement:(id:string)=>void;changeQuantity:(id:string,next:number)=>boolean;
 basket:OrderItem[];count:number;total:number;altered:boolean;
 tier:Tier;chooseTier:(tier:Tier)=>void;offer:number;
 /** Why this price cannot be presented: the offer does not exceed the initial order (M5). */
 offerIssue:string|null;delivery:string;changeDelivery:(value:string)=>void;fee:number|null;
 /** Copies and confirms with its own label (« Argumentaire copié. »); on failure the text opens in a dialog (COPY). */
 copy:(text:string,label:string)=>Promise<void>;copyFallback:CopyFallback|null;closeCopyFallback:()=>void;
 presented:Proposal[];matchingOffer:Proposal|undefined;presentOffer:()=>Promise<void>;handledObjections:string[];toggleObjection:(key:string)=>void;
 consent:boolean;setConsent:(value:boolean)=>void;checked:boolean;setChecked:(value:boolean)=>void;
 callbackAt:string;setCallbackAt:(value:string)=>void;refusal:string;setRefusal:(value:string)=>void;
 /** Saves an outcome; « Cliente non jointe » and « Conserver la commande initiale » ask first (A2). */
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
