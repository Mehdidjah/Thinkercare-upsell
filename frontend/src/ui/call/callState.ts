import {EMPTY_PROFILE,MAX_ITEM_QUANTITY,OUTCOMES,basketProblem,domainOf,expand,isPack,itemsTotal,manualAddCheck,offerProblem,orderOffer,orderSignature,packUpgrades,pricedTotal,proposalOriginals,questionsReady,quantityOf,recommend,reviewReason,type ItemSnapshot,type OrderItem,type Product,type Profile,type Proposal,type Tier} from '@touche/domain';

/**
 * The guided call as plain data, and every change to it as a pure function (plain objects in, plain objects out).
 * Desk (App.tsx) keeps one CallStore in state, persists it per account in sessionStorage and derives the screen from it.
 */
export type CallDraft={
 callId:string;startedAt:string;step:number;
 baseIds:string[];baseQuantities:Record<string,number>;
 profile:Profile;
 /** Domain the answers were given for ('' before any answer): a guiding product of another domain asks before clearing them. */
 profileDomain:string;
 adds:string[];quantities:Record<string,number>;requestedIds:string[];verifiedProducts:string[];upgradeId:string;
 tier:Tier;delivery:string;orderRef:string;customerStage:string;callbackAt:string;handledObjections:string[];linkedCallId:string;
 /** Offers marked « J’ai présenté », and the idempotency key sent for each exact offer. */
 presented:Proposal[];presentationKeys:Record<string,string>;
 consent:boolean;checked:boolean;refusal:string;
 /** The outcome recorded on the server ('' while open) and when the browser received the confirmation. */
 saved:boolean;savedOutcome:string;savedAt:string;
 /** Worked example: simulated, never saved. */
 demo:boolean;
};
/** What a tab keeps: the call on screen and, during an example, the live call set aside. */
export type CallStore={draft:CallDraft;parked:CallDraft|null};
export type Revalidated={draft:CallDraft;removed:string[]};
export type ExampleKind='face'|'hair';

const EXAMPLES:Record<ExampleKind,{baseId:string;profile:Profile}>={
 face:{baseId:'antiacne',profile:{...EMPTY_PROFILE,concerns:['acne'],skin:'mixed',sensitive:'no',routine:[],routineKnown:true,safety:['none'],severity:'mild'}},
 hair:{baseId:'shpousse',profile:{...EMPTY_PROFILE,concerns:['growth','breakage'],skin:'mixed',sensitive:'no',routine:[],routineKnown:true,safety:['none'],severity:''}},
};
const uuid=()=>crypto.randomUUID();

export function newDraft({id=uuid(),now=new Date().toISOString(),example}:{id?:string;now?:string;example?:ExampleKind}={}):CallDraft{
 const sample=example?EXAMPLES[example]:null;
 return {callId:id,startedAt:now,step:sample?1:0,baseIds:sample?[sample.baseId]:[],baseQuantities:{},profile:sample?{...sample.profile}:{...EMPTY_PROFILE},profileDomain:sample?example!:'',
  adds:[],quantities:{},requestedIds:[],verifiedProducts:[],upgradeId:'',tier:'duo',delivery:'',orderRef:'',customerStage:'unknown',callbackAt:'',handledObjections:[],linkedCallId:'',
  presented:[],presentationKeys:{},consent:false,checked:false,refusal:'',saved:false,savedOutcome:'',savedAt:'',demo:!!sample};
}

/** A follow-up call prepared from a recorded call (reminder): same initial order and file, linked to it, at the questions. */
export function resumeDraft(call:{id:string;base_id?:string;order_ref?:string;meta?:{originals?:ItemSnapshot[];original?:ItemSnapshot;orderRef?:string;customerStage?:string}},options:{id?:string;now?:string}={}):CallDraft{
 const originals=call.meta?.originals?.length?call.meta.originals:call.meta?.original?[call.meta.original]:[];
 return {...newDraft(options),step:1,baseIds:originals.length?originals.map(p=>p.id):call.base_id?[call.base_id]:[],baseQuantities:Object.fromEntries(originals.map(p=>[p.id,quantityOf(p)])),
  orderRef:call.meta?.orderRef||call.order_ref||'',customerStage:call.meta?.customerStage||'unknown',linkedCallId:call.id};
}

// ── Guards ─────────────────────────────────────────────────────────────────────────────────────────────────
/** A live call with products and no recorded outcome: leaving it loses work. Examples never count. */
export const isOpenCall=(d:CallDraft|null|undefined):d is CallDraft=>!!d&&!d.demo&&!d.saved&&d.baseIds.length>0;
/** The live call: the one set aside during an example, otherwise the one on screen. */
export const liveCall=(s:CallStore):CallDraft|null=>s.draft.demo?s.parked:s.draft;
export type LeaveReason='new'|'resume'|'signout'|'example'|'leave';
/** Every way out of the call: nothing to lose (go), ask first (confirm), or, for an example, keep the live call aside (park). */
export function leavePlan(s:CallStore,reason:LeaveReason):'go'|'confirm'|'park'{
 if(!isOpenCall(liveCall(s)))return 'go';
 if(reason==='example')return s.draft.demo?'go':'park';
 return 'confirm';
}
/** The browser asks before closing or reloading while a live call is open and unsaved. */
export const needsUnloadPrompt=(s:CallStore)=>isOpenCall(liveCall(s));

/**
 * An example sets the call on screen aside: an open call, or a saved one while « Annuler ce résultat » is still offered
 * (`keepSaved`), so « Quitter l’exemple » brings back its saved panel. A saved call set aside is never « at stake »: the
 * guards and the browser only ask for an open call (liveCall, isOpenCall).
 */
export function startExample(s:CallStore,kind:ExampleKind,options:{id?:string;now?:string;keepSaved?:boolean}={}):CallStore{
 const {keepSaved=false,...fresh}=options;
 const voidable=keepSaved&&s.draft.saved&&!s.draft.demo,keep=voidable||isOpenCall(s.draft);
 return {draft:newDraft({...fresh,example:kind}),parked:s.draft.demo?s.parked:keep?s.draft:null};
}
export function exitExample(s:CallStore,options:{id?:string;now?:string}={}):CallStore{
 return s.draft.demo?{draft:s.parked??newDraft(options),parked:null}:s;
}

// ── Derived basket ───────────────────────────────────────────────────────────────────────────────────────────
const find=(products:Product[],id:string)=>id?products.find(p=>p.id===id):undefined;
const present=<T,>(x:T|undefined):x is T=>!!x;
const withVerified=(d:CallDraft):Profile=>({...d.profile,verifiedProducts:d.verifiedProducts});

export function basketOf(d:CallDraft,products:Product[]){
 const base=find(products,d.baseIds[0]||''),upgrade=find(products,d.upgradeId),active=upgrade||base;
 const initial:OrderItem[]=d.baseIds.map(id=>find(products,id)).filter(present).map(p=>({...p,quantity:d.baseQuantities[p.id]||1}));
 const added=d.adds.map(id=>find(products,id)).filter(present),companions:Product[]=[...initial.slice(1),...added];
 const basket:OrderItem[]=active?[active,...companions].map(p=>({...p,quantity:d.quantities[p.id]??(p.id===d.upgradeId?d.baseQuantities[d.baseIds[0]]:d.baseQuantities[p.id])??1})):[];
 return {base,upgrade,active,initial,added,companions,basket};
}

/** Quantities kept for lines still in the basket and not below their initial quantity. */
function pruneQuantities(d:CallDraft):Record<string,number>{
 const minimum=(id:string)=>id===d.upgradeId?(d.baseQuantities[d.baseIds[0]]||1):d.baseIds.includes(id)?(d.baseQuantities[id]||1):1;
 const lines=new Set([...(d.upgradeId?[d.upgradeId,...d.baseIds.slice(1)]:d.baseIds),...d.adds]);
 return Object.fromEntries(Object.entries(d.quantities).filter(([id,q])=>lines.has(id)&&q>=minimum(id)));
}

/** Warnings each addition carried before a change: they were already accepted, so only new ones remove it. */
function knownWarnings(d:CallDraft,products:Product[]):Map<string,string[]>{
 const {active,initial}=basketOf(d,products),out=new Map<string,string[]>(),added:Product[]=[];
 if(!active)return out;
 for(const id of d.adds){const p=find(products,id);if(!p)continue;out.set(id,manualAddCheck(active,[...initial.slice(1),...added],p,withVerified(d),products).warnings);added.push(p);}
 return out;
}

/**
 * After a change of answers, of the initial order or of a verification: every addition (and the pack) still allowed stays.
 * An addition goes when it is now blocked, when it raises a warning it did not raise before (unless it is still suggested),
 * when it joined the initial order, or when `lost` says it depended on what was removed. A targeted stop removes them all.
 */
function revalidate(before:CallDraft,after:CallDraft,products:Product[],lost:(p:Product)=>boolean=()=>false):Revalidated{
 const removed:string[]=[],stop=!!reviewReason(after.profile),base=find(products,after.baseIds[0]||''),profile=withVerified(after);
 let upgradeId=after.upgradeId;
 if(upgradeId){
  const pack=find(products,upgradeId);
  const valid=!!pack&&!!base&&!stop&&after.baseIds.length===1&&!lost(pack)&&(!questionsReady(after.profile,base)||packUpgrades(products,base,profile).some(c=>c.product.id===upgradeId));
  if(!valid){removed.push(upgradeId);upgradeId='';}
 }
 const active=find(products,upgradeId)||base,known=knownWarnings(before,products);
 const rest=after.baseIds.slice(1).map(id=>find(products,id)).filter(present),kept:Product[]=[];
 for(const id of after.adds){
  const p=find(products,id);
  const keep=(()=>{
   if(!p||!active||stop||after.baseIds.includes(id)||lost(p))return false;
   const companions=[...rest,...kept],check=manualAddCheck(active,companions,p,profile,products);
   if(check.blocked)return false;
   if(recommend(products,active,profile,companions).some(c=>c.product.id===id))return true;
   const seen=known.get(id)||[];
   return check.warnings.every(w=>seen.includes(w));
  })();
  if(keep)kept.push(p!);else removed.push(id);
 }
 // A targeted stop also drops extra units of the initial products: say so (with « Annuler ») like any other removal.
 if(stop)for(const [id,n] of Object.entries(after.quantities))if(after.baseIds.includes(id)&&n>(after.baseQuantities[id]||1)&&!removed.includes(id))removed.push(id);
 const adds=kept.map(p=>p.id),draft={...after,upgradeId,adds,requestedIds:after.requestedIds.filter(id=>adds.includes(id))};
 // A targeted stop also drops extra units of the initial products: nothing is added during a stop, and the rail's
 // quantities are locked then, so they could not be lowered by hand.
 return {draft:{...draft,quantities:stop?{}:pruneQuantities(draft)},removed};
}

// ── Answers ──────────────────────────────────────────────────────────────────────────────────────────────────
const blank=(v:unknown)=>v===undefined||v===null||v===''||v===false||(Array.isArray(v)&&!v.length);
const same=(a:unknown,b:unknown)=>(blank(a)&&blank(b))||JSON.stringify(a)===JSON.stringify(b);
export const hasAnswers=(p:Profile)=>Object.entries(p).some(([k,v])=>k!=='verifiedProducts'&&!blank(v));

/** Re-tapping a selected answer does nothing (null). A real change keeps every addition still allowed for the new answers. */
export function changeProfile(d:CallDraft,patch:Partial<Profile>,products:Product[]):Revalidated|null{
 if(d.saved||Object.entries(patch).every(([k,v])=>same(d.profile[k as keyof Profile],v)))return null;
 const base=find(products,d.baseIds[0]||'');
 const r=revalidate(d,{...d,profile:{...d.profile,...patch},profileDomain:base?domainOf(base):d.profileDomain,checked:false},products);
 return r.removed.length?{draft:{...r.draft,consent:false},removed:r.removed}:r;
}

/** The concern a new pick pushes out (F5): with two already chosen, a third replaces the second. */
export function replacedConcern(p:Profile,id:string):string|null{return !p.concerns.includes(id)&&p.concerns.length>=2?p.concerns[1]:null;}
/** One or two concerns: a third replaces the second; follow-up answers go with their concern. */
export function concernPatch(p:Profile,id:string):Partial<Profile>{
 const a=p.concerns.includes(id)?p.concerns.filter(x=>x!==id):p.concerns.length<2?[...p.concerns,id]:[p.concerns[0],id];
 return {concerns:a,severity:a.includes('acne')?p.severity:'',marks:a.includes('marks')?p.marks:'',hairPattern:a.includes('fall')?p.hairPattern:'',redState:a.includes('red')?p.redState:''};
}

// ── Initial order ────────────────────────────────────────────────────────────────────────────────────────────
/** True when the order may not change: an offer was presented, the outcome is saved, or it is an example (X10: fixed order). */
export const orderLocked=(d:CallDraft)=>d.saved||d.demo||d.presented.length>0;

/** The new guiding product belongs to another domain than the answers: they would be cleared, so ask first. */
export function initialNeedsConfirm(d:CallDraft,ids:string[],products:Product[]):boolean{
 const next=find(products,ids[0]||'');
 return !!next&&!!d.profileDomain&&hasAnswers(d.profile)&&domainOf(next)!==d.profileDomain;
}

/**
 * An offer may already exist on the server under this call id: a « J’ai présenté » whose answer never arrived (network
 * cut, reload) leaves its key in the draft and no proposal on screen. The server then refuses another initial order under
 * that id, so a change of the initial order continues under a new call id; the start time and everything else stay.
 */
function renewedId(d:CallDraft,newId:()=>string):Pick<CallDraft,'callId'|'presentationKeys'>|null{
 return Object.keys(d.presentationKeys).length?{callId:newId(),presentationKeys:{}}:null;
}

/**
 * A new selection of initial products. Same domain: answers, verifications, call id and start time stay, additions are re-checked.
 * Other domain (after confirmation): answers and additions are cleared. Any pack upgrade goes (it replaced the old single product).
 * The call id changes only when an offer may exist on the server under it (renewedId).
 */
export function changeInitialOrder(d:CallDraft,ids:string[],products:Product[],now=new Date().toISOString(),newId:()=>string=uuid):Revalidated|null{
 if(orderLocked(d)||same(ids,d.baseIds))return null;
 const lostUpgrade=d.upgradeId?[d.upgradeId]:[];
 // The call starts when its first product is picked, not when the empty screen was opened (it may have waited for days).
 const moved:CallDraft={...d,...renewedId(d,newId),startedAt:d.baseIds.length?d.startedAt:now,baseIds:ids,baseQuantities:Object.fromEntries(ids.map(id=>[id,d.baseQuantities[id]||1])),upgradeId:'',consent:false,checked:false};
 if(initialNeedsConfirm(d,ids,products))return {draft:{...moved,profile:{...EMPTY_PROFILE},profileDomain:'',adds:[],requestedIds:[],quantities:{},verifiedProducts:[],handledObjections:[]},removed:[...lostUpgrade,...d.adds]};
 const r=revalidate(d,moved,products);
 return {draft:r.draft,removed:[...lostUpgrade,...r.removed]};
}

/** A quantity of the initial order: only that quantity and what depends on it (agreement, compatibility tick) change,
 *  plus the call id when an offer may exist on the server under it (renewedId). */
export function changeInitialQuantity(d:CallDraft,id:string,next:number,newId:()=>string=uuid):CallDraft|null{
 if(orderLocked(d)||!d.baseIds.includes(id)||!Number.isSafeInteger(next)||next<1||next>MAX_ITEM_QUANTITY||(d.baseQuantities[id]||1)===next)return null;
 const draft={...d,...renewedId(d,newId),baseQuantities:{...d.baseQuantities,[id]:next},consent:false,checked:false};
 return {...draft,quantities:pruneQuantities(draft)};
}

// ── Routine ──────────────────────────────────────────────────────────────────────────────────────────────────
export function addComplement(d:CallDraft,id:string,verify:string[],requested:boolean):CallDraft|null{
 if(d.saved||d.adds.includes(id))return null;
 return {...d,verifiedProducts:verify.length?[...new Set([...d.verifiedProducts,...verify])]:d.verifiedProducts,adds:[...d.adds,id],requestedIds:requested&&!d.requestedIds.includes(id)?[...d.requestedIds,id]:d.requestedIds,consent:false,checked:false};
}
export function removeComplement(d:CallDraft,id:string):CallDraft|null{
 if(d.saved||!d.adds.includes(id))return null;
 const quantities={...d.quantities};delete quantities[id];
 return {...d,adds:d.adds.filter(x=>x!==id),quantities,requestedIds:d.requestedIds.filter(x=>x!==id),consent:false,checked:false};
}
export function changeQuantity(d:CallDraft,id:string,next:number,products:Product[]):{draft:CallDraft}|{error:string}|null{
 if(d.saved||!Number.isSafeInteger(next)||next<1||next>MAX_ITEM_QUANTITY)return null;
 const {initial,basket}=basketOf(d,products),item=basket.find(p=>p.id===id);if(!item)return null;
 const minimum=id===d.upgradeId?quantityOf(initial[0]):quantityOf(initial.find(p=>p.id===id)||{quantity:1});
 if(next<minimum||next===quantityOf(item))return null;
 if(next>quantityOf(item)&&(!item.recommendable||item.verificationRequired)&&!d.verifiedProducts.includes(id))return {error:'Confirmez la vérification de cette référence avant d’augmenter la quantité.'};
 const problem=basketProblem(basket.map(p=>p.id===id?{...p,quantity:next}:p),products);if(problem&&next>quantityOf(item))return {error:problem};
 return {draft:{...d,quantities:{...d.quantities,[id]:next},consent:false,checked:false}};
}
/** The official pack replaces the single initial product; the additions were chosen for that product, so they go. */
export function chooseUpgrade(d:CallDraft,id:string):CallDraft|null{
 if(d.saved||d.upgradeId===id)return null;
 return {...d,upgradeId:id,adds:[],requestedIds:[],quantities:{},consent:false,checked:false};
}
/** Back to separate products: the additions still allowed with the single product stay. */
export function clearUpgrade(d:CallDraft,products:Product[]):Revalidated|null{
 if(d.saved||!d.upgradeId)return null;
 return revalidate(d,{...d,upgradeId:'',consent:false,checked:false},products);
}
/** Re-choosing the selected price does nothing; another price voids the customer’s agreement. */
export function chooseTier(d:CallDraft,tier:Tier):CallDraft|null{return d.saved||d.tier===tier?null:{...d,tier,consent:false};}
export function changeDelivery(d:CallDraft,value:string):CallDraft|null{
 const next=value===''?'':String(Math.max(0,Math.min(10000,Math.floor(Number(value)||0))));
 return d.saved||d.delivery===next?null:{...d,delivery:next,consent:false};
}
export function toggleObjection(d:CallDraft,key:string):CallDraft|null{
 return d.saved?null:{...d,handledObjections:d.handledObjections.includes(key)?d.handledObjections.filter(x=>x!==key):[...d.handledObjections,key]};
}

/**
 * « Référence à vérification spécifique ». Ticking only makes more products eligible: nothing is cleared.
 * Unticking removes only the additions (or the pack) that needed that verification.
 */
export function toggleVerification(d:CallDraft,product:Product,checked:boolean,products:Product[]):Revalidated|null{
 if(d.saved)return null;
 const ids=isPack(product)?[product.id,...(product.components||[])]:[product.id];
 if(checked){
  const verifiedProducts=[...new Set([...d.verifiedProducts,...ids])];
  return verifiedProducts.length===d.verifiedProducts.length?null:{draft:{...d,verifiedProducts},removed:[]};
 }
 const verifiedProducts=d.verifiedProducts.filter(x=>!ids.includes(x));
 if(verifiedProducts.length===d.verifiedProducts.length)return null;
 const needed=(p:Product)=>[p,...expand(p,products)].some(x=>ids.includes(x.id)&&(!x.recommendable||!!x.verificationRequired));
 const r=revalidate(d,{...d,verifiedProducts},products,needed);
 return r.removed.length?{draft:{...r.draft,consent:false,checked:false},removed:r.removed}:r;
}

/** « Annuler » on a removal notice: answers, order, verifications and additions as they were; the agreement must be given again.
 *  The call id stays the current one: a change of the initial order may have renewed it (renewedId), and nothing was
 *  presented under the new id. */
export function undoRemoval(current:CallDraft,previous:CallDraft):CallDraft|null{
 const renewed=current.callId!==previous.callId&&Object.keys(previous.presentationKeys).length>0&&!Object.keys(current.presentationKeys).length;
 if(current.saved||current.demo!==previous.demo||(current.callId!==previous.callId&&!renewed)||current.presented.length!==previous.presented.length)return null;
 const {profile,profileDomain,baseIds,baseQuantities,adds,requestedIds,quantities,upgradeId,verifiedProducts}=previous;
 return {...current,profile,profileDomain,baseIds,baseQuantities,adds,requestedIds,quantities,upgradeId,verifiedProducts,consent:false,checked:false};
}

/**
 * The rows the step-3 picker shows, in a stable order (B5, DBL, STEP3). `rows` are every product that may be added (or is
 * added), best first. Without a search only the suggestions and the added products show, unless the whole catalogue is open.
 * `previous` is the order already on screen for the same search: its rows keep their place, new ones come after, so an
 * added product stays under the pointer and a second click cannot land on another row.
 */
export function pickerOrder(rows:{id:string;suggested:boolean;added:boolean}[],{previous=null,showAll=false,searching=false}:{previous?:string[]|null;showAll?:boolean;searching?:boolean}={}):{ids:string[];hidden:number}{
 const wanted=rows.filter(r=>searching||showAll||r.suggested||r.added).map(r=>r.id),known=new Set(rows.map(r=>r.id));
 const ids=previous?[...previous.filter(id=>known.has(id)),...wanted.filter(id=>!previous.includes(id))]:wanted;
 return {ids,hidden:searching?0:rows.length-ids.length};
}

// ── Offers and outcomes ──────────────────────────────────────────────────────────────────────────────────────
/**
 * The presented offer the customer can accept now: the latest one for the initial order, products and quantities, price
 * level and delivery on screen. When the server keeps the presented price ('price-codes': a sale is checked against the
 * presented offer), a catalogue reloaded since then does not change which offer matches and the sale is recorded at its
 * presented amount. Otherwise (older server) the amount must still equal the current one.
 */
export function matchingOffer(presented:Proposal[],now:{initial:OrderItem[];basket:OrderItem[];tier:Tier;fee:number|null;offer:number},keepsPresentedPrice:boolean):Proposal|undefined{
 const initial=orderSignature(now.initial),basket=orderSignature(now.basket);
 return [...presented].reverse().find(p=>orderSignature(proposalOriginals(p))===initial&&orderSignature(p.products)===basket&&p.tier===now.tier&&p.delivery===now.fee&&(keepsPresentedPrice||p.offerTotal===now.offer));
}

/** One label per outcome in the call (F4, A2): « Sans réponse » is « Cliente non jointe » on every call screen. */
export const outcomeLabel=(outcome:string)=>outcome==='noanswer'?'Cliente non jointe':OUTCOMES[outcome]||'résultat enregistré';
/** `outcome` '' : the server answered that this call id was already recorded without saying how (older server). */
export function markSaved(d:CallDraft,outcome:string,at:string):CallDraft{return {...d,saved:true,savedOutcome:outcome,savedAt:at};}
/** The outcome a save-call answer says was recorded: the stored one for a retry of a call already recorded (`duplicate`,
 *  '' when an older server does not say it), otherwise the one just sent. */
export function recordedOutcome(sent:string,result:unknown):{outcome:string;duplicate:boolean}{
 const answer=(result&&typeof result==='object'?result:{}) as {duplicate?:unknown;outcome?:unknown};
 if(!answer.duplicate)return {outcome:sent,duplicate:false};
 return {outcome:typeof answer.outcome==='string'&&answer.outcome in OUTCOMES?answer.outcome:'',duplicate:true};
}
/** A request's answer lands on the call it was sent for: the one on screen, or the one set aside during an example. */
export function applyToCall(s:CallStore,callId:string,change:(d:CallDraft)=>CallDraft):CallStore|null{
 if(s.draft.callId===callId)return {...s,draft:change(s.draft)};
 if(s.parked?.callId===callId)return {...s,parked:change(s.parked)};
 return null;
}
/** Outcomes recorded in one tap until now: they ask first (A2). */
export const CONFIRMED_OUTCOMES=['noanswer','initial'];

/** « Annuler ce résultat » is offered while the server allows the owner to void it. */
export function voidDeadline(d:CallDraft,features:string[]|undefined,windowMinutes:number|undefined):number|null{
 if(!d.saved||d.demo||!features?.includes('void-call')||!d.savedAt)return null;
 const at=Date.parse(d.savedAt);
 return Number.isFinite(at)?at+(windowMinutes??30)*60_000:null;
}
/** After a void: the same answers and basket, a fresh call id linked to the voided call, offers to present again. */
export function reopenAfterVoid(d:CallDraft,id:string=uuid()):CallDraft{
 // A voided follow-up keeps its link to the reminder it came from. When the voided save is what closed that reminder (and
 // nothing reopened or handled it since), void-call reopens it and answers `reopenedReminderId`; saving the right result
 // under the new id then closes it again. Any other call links to the voided call itself, for the journal only: the server
 // never closes the reminder of a voided call through a link.
 return {...d,callId:id,linkedCallId:d.linkedCallId||d.callId,saved:false,savedOutcome:'',savedAt:'',presented:[],presentationKeys:{},consent:false,checked:false};
}

/** The amounts on screen, by the shared rules the server checks (a hair pack's products chosen one by one cost the pack):
 *  `total` the list-price sum, `baseTotal` the initial order's value, `offer` at the chosen price level, and why that offer
 *  cannot be presented (M5). */
export function callAmounts(initial:OrderItem[],basket:OrderItem[],tier:Tier,products:Product[]){
 return {total:itemsTotal(basket),baseTotal:pricedTotal(initial,products),offer:orderOffer(initial,basket,tier,products),offerIssue:offerProblem(initial,basket,tier,products)};
}
/** The price to announce for this call with these catalogue prices. */
export function offerOf(d:CallDraft,products:Product[]):number|null{
 const {initial,basket}=basketOf(d,products);
 return initial.length&&basket.length?orderOffer(initial,basket,d.tier,products):null;
}
/** The catalogue was reloaded under an open call: when the price to announce changed, the customer's agreement was given
 *  for another amount and is unticked. Null when nothing changes. */
export function afterCatalogueChange(d:CallDraft,before:Product[],after:Product[]):CallDraft|null{
 if(d.saved||!d.consent||offerOf(d,before)===offerOf(d,after))return null;
 return {...d,consent:false};
}
/** The lines the call adds (a product outside the initial order, or units above its initial quantity) that the catalogue
 *  now lists as disabled: only those block the offer and must be removed. */
/** Every disabled line of the call, initial products included: what a server without the M3 fix refuses. */
export function disabledLines(d:CallDraft,products:Product[]):OrderItem[]{return basketOf(d,products).basket.filter(p=>!p.enabled);}
export function disabledAdditions(d:CallDraft,products:Product[]):OrderItem[]{
 const {initial,basket}=basketOf(d,products);
 return basket.filter(p=>{const before=initial.find(x=>x.id===p.id);return !p.enabled&&(!before||quantityOf(p)>quantityOf(before));});
}

/**
 * A duplicated browser tab restores the same call under the same id as the tab it was copied from (data/call-claims.ts).
 * The copy's open calls named in `ids` continue under a new id, with nothing presented under it yet. Saved calls and
 * examples stay as they are. Null when nothing changes.
 */
export function forkCopies(s:CallStore,ids:string[],newId:()=>string=uuid):{store:CallStore;hadOffers:boolean}|null{
 let hadOffers=false;
 const fork=(d:CallDraft|null)=>{
  if(!d||d.demo||d.saved||!ids.includes(d.callId))return d;
  hadOffers||=d.presented.length>0||Object.keys(d.presentationKeys).length>0;
  return {...d,callId:newId(),presented:[],presentationKeys:{}};
 };
 const draft=fork(s.draft)!,parked=fork(s.parked);
 return draft===s.draft&&parked===s.parked?null:{store:{draft,parked},hadOffers};
}
/** The calls a tab holds (any it shows or keeps aside), and the ones a freshly restored tab asks about (open ones only). */
export const heldCallIds=(s:CallStore)=>[s.draft,s.parked].filter((d):d is CallDraft=>!!d&&!d.demo).map(d=>d.callId);
export const restoredCallIds=(s:CallStore)=>[s.draft,s.parked].filter((d):d is CallDraft=>!!d&&!d.demo&&!d.saved).map(d=>d.callId);

/** A catalogue change reported by present-offer or save-call: reload the catalogue in place, keep the call. */
export function catalogueChange(error:{code?:string;message?:string}|null|undefined):'price'|'disabled'|null{
 if(!error)return null;
 if(error.code==='price-changed')return 'price';
 if(error.code==='product-disabled')return 'disabled';
 if(error.code)return null;
 // Servers deployed before error codes: the same two situations, recognised by their message.
 if(/(tarif|catalogue) a changé/i.test(error.message||''))return 'price';
 if(/produit a été désactivé|invalides ou désactivés/i.test(error.message||''))return 'disabled';
 return null;
}

// ── Persistence (sessionStorage, one key per account, versioned) ─────────────────────────────────────────────
export const DRAFT_VERSION=1;
export const draftKey=(userId:string)=>`thinkercare:appel:v${DRAFT_VERSION}:${userId}`;
type StorageLike=Pick<Storage,'getItem'|'setItem'|'removeItem'>;

/** Nothing worth keeping: no product, no file reference, nothing saved and no call set aside. */
export const isEmptyStore=(s:CallStore)=>!s.parked&&!s.draft.saved&&!s.draft.baseIds.length&&!s.draft.orderRef&&!s.draft.linkedCallId;
export const serializeStore=(s:CallStore)=>JSON.stringify({v:DRAFT_VERSION,draft:s.draft,parked:s.parked});

/** Every known field with the expected type; anything else falls back to a new call’s value. */
function asDraft(x:unknown):CallDraft|null{
 if(!x||typeof x!=='object')return null;
 const o=x as Record<string,unknown>;
 if(typeof o.callId!=='string'||!o.callId||!Array.isArray(o.baseIds))return null;
 const fresh=newDraft({id:o.callId}) as Record<string,unknown>,out:Record<string,unknown>={};
 for(const [k,v] of Object.entries(fresh))out[k]=typeof o[k]===typeof v&&Array.isArray(o[k])===Array.isArray(v)&&o[k]!==null?o[k]:v;
 const draft=out as CallDraft;
 if(!draft.baseIds.every(id=>typeof id==='string')||![0,1,2].includes(draft.step)||!['catalogue','duo','final'].includes(draft.tier))return null;
 return {...draft,profile:{...EMPTY_PROFILE,...draft.profile}};
}
export function parseStore(text:string|null|undefined):CallStore|null{
 if(!text)return null;
 try{
  const data=JSON.parse(text);
  if(data?.v!==DRAFT_VERSION)return null;
  const draft=asDraft(data.draft);
  return draft?{draft,parked:data.parked?asDraft(data.parked):null}:null;
 }catch{return null;}
}
function sessionStore():StorageLike|null{try{return typeof window==='undefined'?null:window.sessionStorage;}catch{return null;}}
export function loadCallStore(userId:string,storage:StorageLike|null=sessionStore()):CallStore|null{
 try{return parseStore(storage?.getItem(draftKey(userId)));}catch{return null;}
}
export function saveCallStore(userId:string,s:CallStore,storage:StorageLike|null=sessionStore()):void{
 try{if(isEmptyStore(s))storage?.removeItem(draftKey(userId));else storage?.setItem(draftKey(userId),serializeStore(s));}catch{/* Private mode or a full storage: the call stays in memory. */}
}
export function clearCallStore(userId:string,storage:StorageLike|null=sessionStore()):void{
 try{storage?.removeItem(draftKey(userId));}catch{/* nothing to clear */}
}
