import {createContext,useContext,type Dispatch,type SetStateAction} from 'react';
import {type domainOf,type Candidate,type ManualAddCheck,type MissingAnswer,type OrderItem,type Product,type Profile,type Proposal,type Tier} from '@touche/domain';

type Setter<T>=Dispatch<SetStateAction<T>>;
export type CallRequest={product:Product;check:ManualAddCheck;suggestion:Candidate|undefined};

/**
 * What the guided-call screens read. The state and every handler stay in Desk (App.tsx);
 * this context only hands the current values to the call components so each step can live in its own file.
 */
export type CallModel={
 step:number;toStep:(n:number)=>void;reset:(example?:boolean,hair?:boolean)=>void;
 demo:boolean;saved:boolean;busy:boolean;presenting:boolean;
 orderRef:string;setOrderRef:Setter<string>;customerStage:string;setCustomerStage:Setter<string>;linkedCallId:string;
 products:Product[];visible:Product[];search:string;setSearch:Setter<string>;scope:string;setScope:Setter<string>;category:string;setCategory:Setter<string>;
 baseId:string;baseIds:string[];base:Product|undefined;initial:OrderItem[];baseTotal:number;
 changeInitial:(ids:string[])=>void;changeInitialQuantity:(id:string,next:number)=>boolean;
 domain:ReturnType<typeof domainOf>;profile:Profile;changeProfile:(patch:Partial<Profile>)=>void;toggleConcern:(id:string)=>void;
 blocked:string|null;notes:string[];missing:MissingAnswer[];
 upgrades:Candidate[];upgrade:Product|undefined;upgradeId:string;setUpgradeId:Setter<string>;
 adds:string[];setAdds:Setter<string[]>;requestedIds:string[];clearRequests:()=>void;
 verifiedProducts:string[];setVerifiedProducts:Setter<string[]>;setDetail:Setter<Product|null>;
 candidates:Candidate[];requests:CallRequest[];requestSearch:string;setRequestSearch:Setter<string>;confirmId:string;setConfirmId:Setter<string>;
 addComplement:(id:string,verify:string[],requested:boolean)=>void;removeComplement:(id:string)=>void;changeQuantity:(id:string,next:number)=>boolean;
 basket:OrderItem[];count:number;total:number;altered:boolean;
 tier:Tier;setTier:Setter<Tier>;offer:number;delivery:string;setDelivery:Setter<string>;fee:number|null;
 copy:(text:string)=>Promise<void>;
 presented:Proposal[];matchingOffer:Proposal|undefined;presentOffer:()=>Promise<void>;handledObjections:string[];setHandledObjections:Setter<string[]>;
 consent:boolean;setConsent:Setter<boolean>;checked:boolean;setChecked:Setter<boolean>;
 callbackAt:string;setCallbackAt:Setter<string>;refusal:string;setRefusal:Setter<string>;
 record:(outcome:string)=>Promise<void>;
};

export const CallModelContext=createContext<CallModel|null>(null);

export function useCall():CallModel{
 const call=useContext(CallModelContext);
 if(!call)throw new Error('useCall must be used inside <CallModelContext value={…}>.');
 return call;
}
