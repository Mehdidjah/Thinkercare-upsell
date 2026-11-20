import {useState,useEffect,useRef,type ReactNode} from 'react';
import {profileChanges,money,quantityOf,orderSignature,sameOrder,canManageWorkspace,type Proposal,type ItemSnapshot,type OrderItem,missingAnswers,reviewStop,recommend,manualAddCheck,orderOffer,packDuplicate,physicalCount,domainOf,safetyNotes,isPack,expand,packUpgrades,searchIds,closestProducts,concernsFor,type Profile,type Product,type Tier} from '@touche/domain';
import {reportCache} from '../data/report-cache';
import {setExpectedUser,lockRequests,type RequestError} from '../data/api';
import {announceSession,onSessionMessage,sessionReaction} from '../data/session-channel';
import {startCallClaims} from '../data/call-claims';
import {allowedView,landingView,viewFromEntry,viewFromSearch,isGuardEntry,viewHref,backFromGuard} from '../data/view-history';
import Analytics from './Analytics';
import {PersonalProgress,ContributionDashboard} from './Commission';
import {ProductModal} from './shared/ProductModal';
import {Wordmark} from './shared/Wordmark';
import {ViewBoundary} from '../ErrorBoundary';
import {useConfirm,type ConfirmOptions} from './shared/Confirm';
import {useNotify,type NoteKind} from './shell/Notifications';
import {api} from './shared/api';
import {type State} from './shared/types';
import {Login} from './shell/Login';
import {AppShell} from './shell/AppShell';
import {ConnectionScreen,AccountChangedScreen} from './shell/OfflineBanner';
import {Catalogue} from './pages/Catalogue';
import {Coverage} from './pages/Coverage';
import {Protocol} from './pages/Protocol';
import {Admin} from './pages/Admin';
import {Account} from './pages/Account';
import {CallModelContext,type CallModel,type RemovalNotice,type CatalogueNotice,type CopyFallback} from './call/callModel';
import * as callState from './call/callState';
import {CallView} from './call/CallView';
import {catalogueNoticeText} from './call/CallNotices';
import {reveal,focusLater} from './call/reveal';

/** One title per view: the nav label, the breadcrumb, the h1 and document.title (« Pilotage – ThinkerCare »). */
const TITLES:Record<string,string>={coverage:'Parcours produits',call:'Appel guidé',catalogue:'Catalogue',results:'Pilotage',progress:'Ma progression',contributions:'Apports & primes',protocol:'Protocole',admin:'Gestion',account:'Mon compte'};
const DOMAINS:Record<string,string>={Visage:'face',Cheveux:'hair',Corps:'body'},DOMAIN_NAMES:Record<string,string>={face:'visage',hair:'cheveux',body:'corps'};
const scopeFilter=(scope:string)=>(p:Product)=>scope==='Tous'||(scope==='Packs'?isPack(p):domainOf(p)===DOMAINS[scope]);

export default function Desk(){
 const [state,setState]=useState<State|null>(null),[loading,setLoading]=useState(true),[fatal,setFatal]=useState(''),[bootError,setBootError]=useState(''),[view,setView]=useState('call'),[signingOut,setSigningOut]=useState(false);
 const [orderRefAsked,setOrderRefAsked]=useState(false),[loginNotice,setLoginNotice]=useState(''),[locked,setLocked]=useState(false),[offline,setOffline]=useState(()=>typeof navigator!=='undefined'&&navigator.onLine===false);
 const [progressEpoch,setProgressEpoch]=useState(0),[focusOperator,setFocusOperator]=useState(''),[pilotageTab,setPilotageTab]=useState('');
 // Catalogue and Parcours keep their own search, apart from the call's step-0 search (PN4).
 const [catalogueSearch,setCatalogueSearch]=useState(''),[catalogueScope,setCatalogueScope]=useState('Tous'),[coverageSearch,setCoverageSearch]=useState('');
 // The call: one draft, plus the live call set aside during an example, saved per account in this tab (call/callState.ts).
 const [store,setStore]=useState<callState.CallStore>(()=>({draft:callState.newDraft(),parked:null}));
 const [busy,setBusy]=useState(false),[presenting,setPresenting]=useState(false),[search,setSearch]=useState(''),[scope,setScope]=useState('Tous'),[category,setCategory]=useState('Tous'),[detail,setDetail]=useState<Product|null>(null);
 const [confirmId,setConfirmId]=useState(''),[requestSearch,setRequestSearch]=useState(''),[removal,setRemoval]=useState<RemovalNotice|null>(null),[catalogueNotice,setCatalogueNotice]=useState<CatalogueNotice|null>(null),[clock,setClock]=useState(()=>Date.now());
 const [copyFallback,setCopyFallback]=useState<CopyFallback|null>(null);
 const storeRef=useRef(store),stateRef=useRef(state),ownerRef=useRef<string|null>(null),viewRef=useRef(view),lockedRef=useRef(false),callScroll=useRef(0),allowLeave=useRef(false),firstView=useRef(true);
 const claims=useRef<ReturnType<typeof startCallClaims>|null>(null);
 const {notify:push,announce}=useNotify(),confirmAction=useConfirm();
 /** Results not tied to a control. Errors stay on screen (role="alert") until closed. */
 function notify(title:string,kind:NoteKind='success'){push({kind,title});}

 const current=()=>storeRef.current.draft;
 function replaceStore(next:callState.CallStore){storeRef.current=next;setStore(next);}
 /** Every call change goes through here; a transition that returns null changed nothing. */
 function commit(next:callState.CallDraft|null){if(!next)return false;replaceStore({...storeRef.current,draft:next});return true;}
 function putState(next:State|null){stateRef.current=next;setState(next);}
 function resetScreen(){setConfirmId('');setRequestSearch('');setSearch('');setScope('Tous');setCategory('Tous');setRemoval(null);setCatalogueNotice(null);setCopyFallback(null);}
 function lock(){if(lockedRef.current)return;lockedRef.current=true;lockRequests();setLocked(true);}
 const keptNotice=(reason:string)=>reason+(callState.isOpenCall(callState.liveCall(storeRef.current))?' Reconnectez-vous : l’appel en cours est conservé.':' Reconnectez-vous.');

 // ── Views and browser history ─────────────────────────────────────────────────────────────────────────────
 function leaving(){if(viewRef.current==='call')callScroll.current=window.scrollY;}
 function showView(next:string){if(next===viewRef.current)return;leaving();if(next!=='results')setPilotageTab('');viewRef.current=next;setView(next);}
 /** A view chosen in the app: one history entry each, so Back returns to the previous view. */
 function go(next:string){if(next===viewRef.current)return;showView(next);history.pushState({tc:'view',view:next},'',viewHref(next,location));}
 /** First view of an account: a guard entry below it, so Back from it asks before leaving an unsaved call. */
 function enterView(next:string){
  viewRef.current=next;setView(next);
  if(viewFromEntry(history.state))history.replaceState({tc:'view',view:next},'',viewHref(next,location));
  else{history.replaceState({tc:'guard'},'',viewHref(null,location));history.pushState({tc:'view',view:next},'',viewHref(next,location));}
 }
 /** Back reached the guard entry: leave as the browser would, asking first only for an open call (data/view-history.ts).
  *  The view entry goes back on top only when the adviser stays, so Back never loops on the tab's first page. */
 async function leaveApp(){
  await backFromGuard({
   atStake:callState.leavePlan(storeRef.current,'leave')==='confirm',confirm:()=>guardLeaveCall('leave'),
   back:()=>{allowLeave.current=true;history.back();setTimeout(()=>{allowLeave.current=false;},800);},
   restoreView:()=>history.pushState({tc:'view',view:viewRef.current},'',viewHref(viewRef.current,location))});
 }

 // ── Workspace, session and other tabs ─────────────────────────────────────────────────────────────────────
 function acceptState(next:State,login=false){
  reportCache.setUser(next.user.id);
  setExpectedUser(next.features?.includes('expected-user')?next.user.id:null);
  const manager=canManageWorkspace(next.user);
  if(ownerRef.current!==next.user.id){
   // Another account (or the first load): its call kept in this tab comes back, the previous account's stays stored under its own key.
   ownerRef.current=next.user.id;
   const restored=callState.loadCallStore(next.user.id);
   replaceStore(restored??{draft:callState.newDraft(),parked:null});resetScreen();callScroll.current=0;
   // A duplicated tab restored the call of the tab it was copied from: the other tab says so, and this copy forks (forkCopies).
   if(restored)claims.current?.ask(callState.restoredCallIds(restored));
   const asked=login?null:viewFromEntry(history.state)??viewFromSearch(location.search);
   enterView(allowedView(manager,asked)?asked:restored&&callState.isOpenCall(callState.liveCall(restored))?'call':landingView(manager));
  }else{
   // The same account reloaded: a catalogue change may move the price of the open call.
   if(stateRef.current&&stateRef.current.products!==next.products)keepAgreementHonest(stateRef.current.products,next.products);
   if(!allowedView(manager,viewRef.current))enterView(landingView(manager));
  }
  if(login)announceSession({type:'login',userId:next.user.id});
  putState(next);setFatal('');setBootError('');setLoginNotice('');
 }
 async function load(){
  try{acceptState(await api());}
  catch(e){const error=e as RequestError;if(error.status===401)putState(null);else if(error.code==='account-changed')lock();else if(stateRef.current)setFatal(error.message);else setBootError(error.message);}
  finally{setLoading(false);}
 }
 function retryStartup(){setBootError('');setLoading(true);void load();}
 /** Another tab held this call id first: this tab is a copy (duplicated tab) and its call continues under a new id. */
 function forkCopies(ids:string[]){
  const r=callState.forkCopies(storeRef.current,ids);if(!r)return;
  replaceStore(r.store);
  notify(r.hadOffers?'Onglet dupliqué : cette copie devient un appel distinct. Présentez de nouveau l’offre avant d’enregistrer un accord.':'Onglet dupliqué : cette copie devient un appel distinct de celui de l’autre onglet.','info');
 }
 /** The catalogue changed under the call: an agreement given for another amount is unticked (draft and call set aside). */
 function keepAgreementHonest(before:Product[],after:Product[]){
  const s=storeRef.current,draft=callState.afterCatalogueChange(s.draft,before,after),parked=s.parked&&callState.afterCatalogueChange(s.parked,before,after);
  if(draft||parked)replaceStore({draft:draft??s.draft,parked:parked??s.parked});
 }
 useEffect(()=>{
  claims.current=startCallClaims({held:()=>callState.heldCallIds(storeRef.current),onTaken:forkCopies});
  void load();
  // Session expiry keeps the call: the login form says so and the same account gets it back (H1).
  const expired=()=>{if(!stateRef.current)return;putState(null);setLoginNotice(keptNotice('Votre session a expiré.'));};
  const changed=()=>lock();
  const offSession=onSessionMessage(message=>{
   const reaction=sessionReaction(stateRef.current?.user.id,message);
   if(reaction==='lock')lock();
   else if(reaction==='signed-out'){reportCache.setUser(null);putState(null);setLoginNotice(keptNotice('Session fermée dans un autre onglet.'));}
  });
  const onPop=(event:PopStateEvent)=>{
   const user=stateRef.current?.user;if(!user||lockedRef.current)return;
   if(isGuardEntry(event.state)){void leaveApp();return;}
   const asked=viewFromEntry(event.state)??viewFromSearch(location.search),manager=canManageWorkspace(user);
   showView(allowedView(manager,asked)?asked:landingView(manager));
  };
  const down=()=>setOffline(true),up=()=>setOffline(false);
  window.addEventListener('desk-session-expired',expired);window.addEventListener('desk-account-changed',changed);window.addEventListener('popstate',onPop);window.addEventListener('offline',down);window.addEventListener('online',up);
  return()=>{claims.current?.stop();claims.current=null;offSession();window.removeEventListener('desk-session-expired',expired);window.removeEventListener('desk-account-changed',changed);window.removeEventListener('popstate',onPop);window.removeEventListener('offline',down);window.removeEventListener('online',up);};
 },[]);
 // The call is saved in this tab on every change (A4); an empty call removes the key.
 useEffect(()=>{if(ownerRef.current)callState.saveCallStore(ownerRef.current,store);},[store]);
 // The account-changed lock keeps the warning: the open call is only stored in this tab (« Recharger la page » lets it through).
 const unsaved=callState.needsUnloadPrompt(store);
 useEffect(()=>{
  if(!unsaved)return;
  const warn=(event:BeforeUnloadEvent)=>{if(allowLeave.current)return;event.preventDefault();event.returnValue='';};
  window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
 },[unsaved]);
 // On every view change: the tab title names the view and focus moves to its h1. Each view starts at the top, except the
 // call view, which comes back where the adviser left it (VIEWSCROLL).
 useEffect(()=>{document.title=(state?TITLES[view]+' – ':'')+'ThinkerCare';},[view,state]);
 useEffect(()=>{if(firstView.current){firstView.current=false;return;}if(view==='call')window.scrollTo(0,callScroll.current);else window.scrollTo(0,0);const id=requestAnimationFrame(()=>{const h=document.querySelector<HTMLElement>('#contenu h1');if(!h)return;if(!h.hasAttribute('tabindex'))h.setAttribute('tabindex','-1');h.focus({preventScroll:true});});return()=>cancelAnimationFrame(id);},[view]);
 const deadline=state?callState.voidDeadline(store.draft,state.features,state.void_window_minutes):null;
 useEffect(()=>{if(deadline===null)return;const left=deadline-Date.now();if(left<=0){setClock(Date.now());return;}const t=setTimeout(()=>setClock(Date.now()),left+50);return()=>clearTimeout(t);},[deadline]);

 // ── Leaving the call ──────────────────────────────────────────────────────────────────────────────────────
 /** The one guard for every way out of a live unsaved call (A1): new call, resume, sign-out, Back out of the app.
  *  An example keeps the live call aside instead of asking. */
 async function guardLeaveCall(reason:callState.LeaveReason){
  const s=storeRef.current,plan=callState.leavePlan(s,reason);
  if(plan!=='confirm')return true;
  const live=callState.liveCall(s)!,catalogue=stateRef.current?.products||[],{initial,basket}=callState.basketOf(live,catalogue),units=physicalCount(basket,catalogue);
  const what=<>Le brouillon {live.orderRef||'sans référence'} ({units} soin{units>1?'s':''}, {live.presented.length?`offre présentée à ${money(orderOffer(initial,basket,live.tier,catalogue))}`:'offre non présentée'}){s.draft.demo?', mis de côté pendant l’exemple,':''}</>;
  if(reason==='leave')return confirmAction({title:'Quitter ThinkerCare ?',body:<p>{what} n’est pas enregistré. Il reste gardé dans cet onglet si vous y revenez, mais il sera perdu si l’onglet est fermé.</p>,cancelLabel:'Rester sur l’appel',confirmLabel:'Quitter la page',tone:'danger'});
  return confirmAction({title:reason==='signout'?'Se déconnecter et abandonner l’appel ?':'Abandonner l’appel en cours ?',body:<p>{what} sera supprimé.</p>,cancelLabel:'Reprendre l’appel',confirmLabel:reason==='signout'?'Abandonner et se déconnecter':'Abandonner l’appel',tone:'danger'});
 }
 async function signOut(){
  if(signingOut||!(await guardLeaveCall('signout')))return;
  setSigningOut(true);
  try{await api({action:'logout'});}
  catch(error){const e=error as RequestError;if(e.status!==401&&e.code!=='account-changed'){notify('Déconnexion impossible. Vérifiez votre connexion et réessayez.','error');return;}}
  finally{setSigningOut(false);}
  const me=ownerRef.current;
  if(me){callState.clearCallStore(me);announceSession({type:'logout',userId:me});}
  ownerRef.current=null;replaceStore({draft:callState.newDraft(),parked:null});resetScreen();setDetail(null);setExpectedUser(null);
  history.replaceState(history.state,'',viewHref(null,location));
  putState(null);setFatal('');setFocusOperator('');setLoginNotice('');
 }
 function startFresh(next:callState.CallStore){replaceStore(next);resetScreen();callScroll.current=0;if(viewRef.current==='call')window.scrollTo(0,0);else go('call');}
 async function newCall(){if(await guardLeaveCall('new'))startFresh({draft:callState.newDraft(),parked:null});}
 /** An example sets the call aside: an open one, or a saved one while it may still be voided (« Annuler ce résultat »). */
 async function startExample(kind:callState.ExampleKind){
  if(busy||presenting)return;
  const parks=callState.leavePlan(storeRef.current,'example')==='park';
  if(!(await guardLeaveCall('example')))return;
  const s=storeRef.current,until=callState.voidDeadline(s.draft,stateRef.current?.features,stateRef.current?.void_window_minutes);
  const next=callState.startExample(s,kind,{keepSaved:until!==null&&Date.now()<until});
  startFresh(next);
  if(parks)notify('Appel en cours mis de côté. « Quitter l’exemple » le reprend.','info');
  else if(!s.draft.demo&&next.parked?.saved)notify('Appel enregistré mis de côté. « Quitter l’exemple » le ramène, avec « Annuler ce résultat » tant que c’est possible.','info');
 }
 function exitExample(){const s=storeRef.current;if(!s.draft.demo)return;startFresh(callState.exitExample(s));if(s.parked)notify(s.parked.saved?'Appel enregistré repris.':'Appel en cours repris là où vous l’aviez laissé.','info');}
 async function resume(call:any){if(await guardLeaveCall('resume'))startFresh({draft:callState.resumeDraft(call),parked:null});}

 // ── The call on screen ────────────────────────────────────────────────────────────────────────────────────
 const d=store.draft,products=state?.products||[];
 const {base,upgrade,active:activeBase,initial,companions,basket}=callState.basketOf(d,products);
 const baseId=d.baseIds[0]||'',profile=d.profile,verifiedProducts=d.verifiedProducts,tier=d.tier;
 // Same shared pricing as the server: a hair pack's products chosen one by one cost the pack (callState.callAmounts).
 const {total,baseTotal,offer,offerIssue}=callState.callAmounts(initial,basket,tier,products),fee=d.delivery===''?null:Number(d.delivery),stop=reviewStop(profile),blocked=stop?.text??null;
 // The official pack offered for a single initial product. Once something is added it is held back, with a note (PACK).
 const packsAlone=base&&initial.length===1&&!d.upgradeId?packUpgrades(products,base,{...profile,verifiedProducts}):[];
 const upgrades=d.adds.length?[]:packsAlone,heldPacks=d.adds.length?packsAlone.map(c=>c.product):[];
 const candidates=activeBase?recommend(products,activeBase,{...profile,verifiedProducts},companions):[],count=physicalCount(basket,products),altered=!sameOrder(initial,basket),domain=domainOf(base),notes=safetyNotes(profile),missing=missingAnswers(profile,base);
 const duplicate=packDuplicate(initial,products);
 const selectedQuantities=Object.fromEntries(basket.map(p=>[p.id,quantityOf(p)]));
 const requestIds=searchIds(products,requestSearch),orderIds=searchIds(products,search);
 // Step 3: every product that may be added, the added ones kept in their row (B5), and every line of the basket with
 // « + Une unité » (UNIT). A pack offered as the upgrade is never a blocked row here (PACK). A search with no exact match
 // lists the closest products (SEARCH).
 const packIds=new Set(packsAlone.map(c=>c.product.id));
 const lines=callState.basketLines(d,products);
 const pool=d.step===2&&activeBase&&!blocked?callState.pickerPool(d,products,packIds):[];
 const exact=pool.filter(p=>requestIds.has(p.id)),requestApproximate=!!requestSearch.trim()&&!exact.length;
 const requestable=(requestApproximate?closestProducts(pool,requestSearch,5):exact).map(p=>{const added=d.adds.includes(p.id);return {product:p,added,check:manualAddCheck(activeBase!,added?companions.filter(c=>c.id!==p.id):companions,p,{...profile,verifiedProducts},products),suggestion:candidates.find(r=>r.product.id===p.id),line:lines.get(p.id)};});
 const suggestionRanks=new Map(candidates.map((r,i)=>[r.product.id,i]));
 const requests=requestApproximate?requestable:requestable.sort((a,b)=>(suggestionRanks.get(a.product.id)??candidates.length)-(suggestionRanks.get(b.product.id)??candidates.length)||Number(domainOf(b.product)===domain)-Number(domainOf(a.product)===domain));
 const inScope=scopeFilter(scope);
 const visible=products.filter(p=>p.enabled&&inScope(p)&&(category==='Tous'||p.category===category)&&orderIds.has(p.id));
 const nearby=!visible.length&&search.trim()?closestProducts(products.filter(p=>p.enabled),search,6):[];
 // A server that keeps the presented price ('price-codes') checks a sale against the presented offer: a catalogue reloaded
 // since then does not change which offer the customer accepted, nor its amount (callState.matchingOffer).
 const keepsPresentedPrice=!!state?.features?.includes('price-codes');
 const matchingOffer=callState.matchingOffer(d.presented,{initial,basket,tier,fee,offer},keepsPresentedPrice);
 /** Each copy says what was copied; when the browser refuses, the text opens in a dialog to select by hand (COPY). */
 async function copy(text:string,label:string){try{await navigator.clipboard.writeText(text);notify(label);}catch{setCopyFallback({text,label});}}
 const productName=(id:string)=>(stateRef.current?.products||[]).find(p=>p.id===id)?.short||id;
 const unitsOf=(draft:callState.CallDraft)=>{const list=stateRef.current?.products||[];const n=physicalCount(callState.basketOf(draft,list).basket,list);return `${n} unité${n>1?'s':''}`;};

 /** A change that may remove additions: they are listed with « Annuler » (A3, SPEC). */
 function applyRemoval(previous:callState.CallDraft,r:callState.Revalidated|null,offerUndo=true){
  if(!r||!commit(r.draft))return;
  setConfirmId('');
  // « Annuler » only ever undoes the latest change: a later one keeps the notice but drops its button.
  if(!r.removed.length||!offerUndo){setRemoval(previousNotice=>previousNotice&&{...previousNotice,undo:null});return;}
  const names=r.removed.map(id=>(stateRef.current?.products||[]).find(p=>p.id===id)?.short||id);
  // The notice and its button go away: focus moves to the step heading, never to the page body.
  setRemoval({id:Date.now(),names,undo:()=>{commit(callState.undoRemoval(current(),previous));setRemoval(null);focusLater('#workflow-heading');}});
 }
 // Going back from « Clôturer l’appel » and re-tapping an unchanged answer keeps the routine (callState also drops only invalid additions).
 const changeProfile=(patch:Partial<Profile>)=>{if(!profileChanges(profile,patch))return;applyRemoval(current(),callState.changeProfile(current(),patch,products));};
 /** A third concern replaces the second: screen readers hear which one (F5). */
 function toggleConcern(id:string){
  const before=current().profile,replaced=callState.replacedConcern(before,id);
  changeProfile(callState.concernPatch(before,id));
  if(replaced&&current().profile!==before){const label=(c:string)=>concernsFor(products.find(p=>p.id===current().baseIds[0])).find(x=>x[0]===c)?.[1]||c;announce(`« ${label(replaced)} » remplacé par « ${label(id)} ».`);}
 }
 /** Resolves true when the new initial order is applied. */
 async function changeInitial(ids:string[]):Promise<boolean>{
  const now=current();
  if(callState.orderLocked(now))return false;
  if(ids.length>32){notify('Trente-deux références maximum par commande initiale.','error');return false;}
  const clears=callState.initialNeedsConfirm(now,ids,products);
  if(clears){
   const next=products.find(p=>p.id===ids[0]);
   if(!(await confirmAction({title:'Changer de produit guide ?',body:<p>{next?.name} relève de l’univers {DOMAIN_NAMES[domainOf(next)]}, les réponses déjà données concernent l’univers {DOMAIN_NAMES[now.profileDomain]||now.profileDomain}. Les réponses et les produits ajoutés seront effacés.</p>,cancelLabel:'Garder la commande actuelle',confirmLabel:'Changer et effacer les réponses',tone:'danger'}))||current()!==now)return false;
  }
  const r=callState.changeInitialOrder(now,ids,products);
  applyRemoval(now,r,!clears);
  return !!r;
 }
 const changeInitialQuantity=(id:string,next:number)=>commit(callState.changeInitialQuantity(current(),id,next));
 // The search stays after an addition: the list keeps its order and the row says « Dans la routine ✓ » (B5).
 function addComplement(id:string,verify:string[],requested:boolean){if(commit(callState.addComplement(current(),id,verify,requested))){setConfirmId('');announce(`${productName(id)} ajouté · ${unitsOf(current())}`);}}
 function removeComplement(id:string){if(!busy&&!presenting&&commit(callState.removeComplement(current(),id)))announce(`${productName(id)} retiré · ${unitsOf(current())}`);}
 /** The rail's quantity and « + Une unité » share one change (callState.changeQuantity): a refusal says why. */
 function applyQuantity(r:ReturnType<typeof callState.changeQuantity>){
  if(busy||presenting)return false;
  if(r&&'error' in r){notify(r.error,'error');return false;}
  return commit(r?.draft??null);
 }
 const changeQuantity=(id:string,next:number)=>applyQuantity(callState.changeQuantity(current(),id,next,products));
 /** « + Une unité » in the step-3 list: focus stays on its button, the new quantity is announced (UNIT). */
 function addUnit(id:string){
  if(!applyQuantity(callState.addUnit(current(),id,products)))return false;
  announce(`${productName(id)} : une unité ajoutée, ×${current().quantities[id]} · ${unitsOf(current())}`);
  return true;
 }
 /** The check confirmed in the picker row, then one unit: as ticking the check, then « + Une unité » (UNIT-CHECK). */
 function verifyAndAddUnit(id:string){
  if(!applyQuantity(callState.verifyAndAddUnit(current(),id,products)))return false;
  announce(`${productName(id)} : vérification confirmée, une unité ajoutée, ×${current().quantities[id]} · ${unitsOf(current())}`);
  return true;
 }
 function chooseUpgrade(id:string){if(commit(callState.chooseUpgrade(current(),id))){setConfirmId('');setRequestSearch('');}}
 const clearUpgrade=()=>applyRemoval(current(),callState.clearUpgrade(current(),products));
 const toggleVerified=(product:Product,checked:boolean)=>applyRemoval(current(),callState.toggleVerification(current(),product,checked,products));
 /** Plain fields of the record: read-only once the outcome is saved. */
 const edit=<K extends keyof callState.CallDraft>(key:K)=>(value:callState.CallDraft[K])=>{const now=current();if(!now.saved&&now[key]!==value)commit({...now,[key]:value});};
 const toStep=(n:number)=>{commit({...current(),step:n});setTimeout(()=>document.getElementById('workflow-heading')?.focus(),0);};

 /** A catalogue change during the call (H2): reload the catalogue in place, keep every call field, show the new amount inline. */
 async function refreshCatalogue(kind:'price'|'disabled'){
  try{
   const fresh=await api() as State;
   if(fresh.user.id!==stateRef.current?.user.id){lock();return;}
   const before=stateRef.current.products;
   putState(fresh);keepAgreementHonest(before,fresh.products);
   // With the M3 server only the lines the call adds can block the offer (recording-8); an older server also refuses a
   // disabled product of the customer's own order, for every outcome, so name it and say what that means.
   const additionsOnly=!!fresh.features?.includes('price-codes'),lines=kind!=='disabled'?[]:additionsOnly?callState.disabledAdditions(current(),fresh.products):callState.disabledLines(current(),fresh.products);
   const notice:CatalogueNotice={kind,names:lines.map(p=>p.short||p.name),initial:!additionsOnly&&lines.some(p=>current().baseIds.includes(p.id))};
   setCatalogueNotice(notice);
   // The notice may sit above the screen: the same words come as a message, and focus moves to the notice.
   const now=current(),text=catalogueNoticeText(notice,callState.offerOf(now,fresh.products)??0,now.delivery===''?null:Number(now.delivery));
   push({kind:'info',title:text.title,detail:text.detail});
   requestAnimationFrame(()=>reveal(document.getElementById('call-catalogue-notice')));
  }catch(error){notify('Le catalogue a changé et n’a pas pu être rechargé : '+(error as Error).message,'error');}
 }
 async function callError(e:unknown){
  const error=e as RequestError,kind=callState.catalogueChange(error);
  if(kind)return refreshCatalogue(kind);
  if(error.status===401||error.code==='account-changed')return; // the login form or the lock screen says it
  notify(error.message,'error');
 }
 async function presentOffer(){
  const now=current();
  if(!base||!altered||blocked||offerIssue||now.saved||presenting)return;
  setPresenting(true);try{
   let proposal:Proposal;
   if(now.demo){const snap=(p:OrderItem):ItemSnapshot=>({id:p.id,name:p.name,price:p.price,quantity:quantityOf(p),components:isPack(p)?expand(p,products).map(x=>({id:x.id,name:x.name,price:x.price})):[]});proposal={id:crypto.randomUUID(),call_id:now.callId,user_id:state!.user.id,created_at:new Date().toISOString(),base:snap(initial[0]),originals:initial.map(snap),products:basket.map(snap),catalogueTotal:total,offerTotal:offer,extra:offer-baseTotal,tier,delivery:fee,version:3};}
   else {
    // One idempotency key per exact offer, kept with the draft so a retry after a reload is the same request.
    const signature=JSON.stringify([now.callId,orderSignature(initial),orderSignature(basket),tier,fee,offer]);
    let key=now.presentationKeys[signature];if(!key){key=crypto.randomUUID();commit({...current(),presentationKeys:{...current().presentationKeys,[signature]:key}});}
    const data=await api({action:'present-offer',id:key,callId:now.callId,baseId,baseIds:now.baseIds,baseQuantities:now.baseQuantities,quantities:selectedQuantities,productIds:basket.map(p=>p.id),upgradeId:now.upgradeId||undefined,tier,delivery:fee,agreedTotal:offer,verifiedProducts:now.verifiedProducts});proposal=data.proposal;
   }
   // The answer lands on the call it was sent for, even if an example has set it aside since.
   const store=callState.applyToCall(storeRef.current,now.callId,call=>({...call,presented:[...call.presented,proposal]}));if(!store)return;
   replaceStore(store);if(current().callId===now.callId){setCatalogueNotice(null);setRemoval(null);}
   notify(now.demo?'Exemple : offre simulée, aucune donnée enregistrée.':'Offre présentée enregistrée avec son prix et sa composition.',now.demo?'info':'success');
  }catch(e){await callError(e);}finally{setPresenting(false);}
 }
 const voidable=!!state?.features?.includes('void-call'),voidMinutes=state?.void_window_minutes??30;
 /** « Cliente non jointe » (« Sans réponse » in Pilotage) and « Conserver la commande initiale » were one tap and permanent: they ask first (A2). */
 function outcomeConfirm(outcome:string):ConfirmOptions{
  const after:ReactNode=voidable?<> Vous pourrez l’annuler pendant {voidMinutes} minutes.</>:' Il ne pourra plus être modifié.';
  return outcome==='noanswer'
   ?{title:'Cliente non jointe ?',body:<p>L’appel sera enregistré comme cliente non jointe (« Sans réponse » dans le pilotage).{after}</p>,cancelLabel:'Revenir à l’appel',confirmLabel:'Enregistrer : cliente non jointe',tone:'primary'}
   :{title:'Conserver la commande initiale ?',body:<p>L’appel sera enregistré sans ajout : la cliente garde sa commande initiale.{after}</p>,cancelLabel:'Revenir à l’appel',confirmLabel:'Enregistrer sans ajout',tone:'primary'};
 }
 /** `callback`: the targeted stop's « Programmer un rappel », recorded as « review » with its callback date. */
 async function record(outcome:string,{callback=false}:{callback?:boolean}={}){
  const now=current(),withCallback=outcome==='callback'||callback;
  if(!base)return;if(now.demo){notify('Exemple : aucun résultat n’est enregistré.','info');return;}if(now.saved||busy)return;
  // Every recorded result names its dossier: open the call context if it is folded, then move to the field.
  if(!now.orderRef.trim()){setOrderRefAsked(true);notify('Renseignez la référence du dossier avant d’enregistrer le résultat.','error');requestAnimationFrame(()=>{const field=document.getElementById('call-order-ref') as HTMLInputElement|null;const fold=field?.closest('details');if(fold)fold.open=true;field?.focus();});return;}
  const won=['duo','trio','routine'].includes(outcome);
  if(blocked&&won){notify('Vérification ciblée nécessaire.','error');return;}
  if(won&&offerIssue){notify(offerIssue,'error');return;}
  if(won&&!matchingOffer){notify('Marquez d’abord cette offre exacte comme présentée.','error');return;}
  if(outcome==='refused'&&!now.presented.length){notify('Pour mesurer un refus d’ajout, marquez l’offre réellement présentée. Sinon, conservez la commande initiale.','error');return;}
  if(withCallback&&!now.callbackAt){notify('Renseignez la date et l’heure du rappel.','error');return;}
  if(callState.CONFIRMED_OUTCOMES.includes(outcome)&&(!(await confirmAction(outcomeConfirm(outcome)))||current()!==now))return;
  setBusy(true);try{
   // An accepted sale carries the presented amount (equal to the current one unless the server keeps the presented price).
   const result=await api({action:'save-call',id:now.callId,baseId,baseIds:now.baseIds,baseQuantities:now.baseQuantities,quantities:selectedQuantities,productIds:basket.map(p=>p.id),upgradeId:now.upgradeId||undefined,agreedTotal:won?matchingOffer!.offerTotal:offer,outcome,tier:altered?tier:'catalogue',delivery:fee,consent:now.consent,checked:now.checked,refusal:now.refusal,verifiedProducts:now.verifiedProducts,
    meta:{version:3,source:'manual',customerStage:now.customerStage,orderRef:now.orderRef,startedAt:now.startedAt||new Date().toISOString(),eligible:!blocked&&(altered||candidates.length>0||upgrades.length>0||now.presented.length>0),acceptedProposalId:won?matchingOffer!.id:undefined,objections:now.handledObjections,callbackAt:withCallback?new Date(now.callbackAt+':00+01:00').toISOString():undefined,linkedCallId:now.linkedCallId||undefined}});
   // The screen shows what the server recorded, even if a field was touched during the request: for a call id already
   // recorded (a retry, another tab), the stored outcome, never the button just clicked; a date not sent is not kept.
   const recorded=callState.recordedOutcome(outcome,result);
   const keptCallback=recorded.duplicate?recorded.outcome==='callback'||(recorded.outcome===outcome&&withCallback):withCallback;
   const store=callState.applyToCall(storeRef.current,now.callId,()=>callState.markSaved({...now,callbackAt:keptCallback?now.callbackAt:''},recorded.outcome,new Date().toISOString()));
   const onScreen=current().callId===now.callId;
   if(store)replaceStore(store);
   if(onScreen){setRemoval(null);setCatalogueNotice(null);}
   setProgressEpoch(x=>x+1);
   // A follow-up that reached the customer closes the reminder it came from (M2): say so, and let the adviser reopen it.
   const closed=typeof result?.closedReminderId==='string'?result.closedReminderId:'';
   if(recorded.duplicate)notify(recorded.outcome?`Cet appel était déjà enregistré : ${callState.outcomeLabel(recorded.outcome)}.`:'Cet appel était déjà enregistré.','info');
   else if(closed)push({kind:'success',title:'Résultat enregistré. Le rappel d’origine est marqué traité.',action:state?.features?.includes('reopen-reminder')?{label:'Rouvrir le rappel',run:()=>{void api({action:'reopen-reminder',id:closed}).then(()=>notify('Rappel rouvert : il revient dans les rappels à traiter.')).catch(e=>notify((e as Error).message,'error'));}}:undefined});
   else notify('Résultat enregistré dans le pilotage interne. Aucun système externe modifié.');
   // The saved panel comes into view with focus on its title, wherever the button was (SavedPanel).
   if(onScreen&&store)requestAnimationFrame(()=>{const title=document.getElementById('call-saved-title');reveal(title?.closest<HTMLElement>('.call-saved'),'center',title);});
  }catch(e){await callError(e);}finally{setBusy(false);}
 }
 /** Voids the saved outcome (H5), then reopens the same call under a new id linked to the voided one. Returns an error text or ''. */
 async function voidCall(reason:string){
  const now=current();if(!now.saved||now.demo)return '';
  try{await api({action:'void-call',id:now.callId,reason});}
  catch(e){const error=e as RequestError;if(error.code!=='already-voided')return error.message;}
  if(current().callId===now.callId)commit(callState.reopenAfterVoid(current()));
  setProgressEpoch(x=>x+1);notify('Résultat annulé. L’appel est rouvert : enregistrez le bon résultat.');
  // The saved panel and its button are gone: focus moves to the close-out (step 3) or to the step heading.
  requestAnimationFrame(()=>(document.getElementById('call-close-title')??document.getElementById('workflow-heading'))?.focus());
  return '';
 }

 if(locked)return <AccountChangedScreen onReload={()=>{allowLeave.current=true;window.location.reload();}}/>;
 if(loading)return <div className="shell-loading" role="status"><div className="shell-loading__inner"><Wordmark size="lg"/><span className="shell-loading__bar" aria-hidden="true"/><p>Ouverture de votre espace conseil…</p></div></div>;
 if(!state)return bootError?<ConnectionScreen message={bootError} retry={retryStartup}/>:<Login onSuccess={next=>acceptState(next,true)} notice={loginNotice}/>;
 const titles=TITLES;
 // Everything the guided-call components read (call/callModel.tsx); the state itself stays here.
 const call:CallModel={
  step:d.step,toStep,demo:d.demo,saved:d.saved,busy,presenting,
  savedOutcome:d.savedOutcome,savedAt:d.savedAt,canVoid:deadline!==null&&clock<deadline,voidCall,
  newCall:()=>void newCall(),startExample:kind=>void startExample(kind),exitExample,hasParkedCall:!!store.parked,parkedSaved:!!store.parked?.saved,
  orderRef:d.orderRef,setOrderRef:edit('orderRef'),orderRefAsked:orderRefAsked&&!d.orderRef.trim(),customerStage:d.customerStage,setCustomerStage:edit('customerStage'),linkedCallId:d.linkedCallId,
  products,visible,nearby,search,setSearch,scope,setScope,category,setCategory,
  baseId,baseIds:d.baseIds,base,initial,baseTotal,orderLocked:callState.orderLocked(d),changeInitial,changeInitialQuantity,duplicate,
  domain,profile,changeProfile,toggleConcern,blocked,stop,notes,missing,
  upgrades,heldPacks,upgrade,upgradeId:d.upgradeId,chooseUpgrade,clearUpgrade,adds:d.adds,requestedIds:d.requestedIds,
  verifiedProducts,toggleVerified,setDetail,
  candidates,requests,requestApproximate,requestSearch,setRequestSearch,confirmId,setConfirmId,addComplement,removeComplement,changeQuantity,addUnit,verifyAndAddUnit,
  basket,count,total,altered,tier,chooseTier:(t:Tier)=>commit(callState.chooseTier(current(),t)),offer,offerIssue,delivery:d.delivery,changeDelivery:value=>commit(callState.changeDelivery(current(),value)),fee,copy,copyFallback,closeCopyFallback:()=>setCopyFallback(null),
  presented:d.presented,matchingOffer,keepsPresentedPrice,presentOffer,handledObjections:d.handledObjections,toggleObjection:key=>commit(callState.toggleObjection(current(),key)),
  consent:d.consent,setConsent:edit('consent'),checked:d.checked,setChecked:edit('checked'),callbackAt:d.callbackAt,setCallbackAt:edit('callbackAt'),refusal:d.refusal,setRefusal:edit('refusal'),record,
  removal,dismissRemoval:()=>setRemoval(null),catalogueNotice,dismissCatalogueNotice:()=>setCatalogueNotice(null)};
 // « Voir les appels » opens the journal filtered on the adviser; the filter is dropped once Pilotage has applied it (F3).

 return <AppShell state={state} view={view} setView={go} titles={titles} signingOut={signingOut} signOut={signOut} newCall={()=>void newCall()} fatal={fatal} offline={offline} load={load} modal={detail&&<ProductModal detail={detail} setDetail={setDetail} products={products}/>}>
 {/* The progress card has its own boundary: a failure there never hides the call. */}
 {view==='call'&&!canManageWorkspace(state.user)&&<ViewBoundary title='Votre progression n’a pas pu s’afficher.'><PersonalProgress compact refreshKey={progressEpoch} features={state.features}/></ViewBoundary>}
 {view==='call'&&<CallModelContext value={call}><CallView/></CallModelContext>}
 {view==='catalogue'&&<Catalogue search={catalogueSearch} setSearch={setCatalogueSearch} scope={catalogueScope} setScope={setCatalogueScope} products={products} inScope={scopeFilter(catalogueScope)} setDetail={setDetail} canManage={canManageWorkspace(state.user)}/>}
 {view==='coverage'&&<Coverage search={coverageSearch} setSearch={setCoverageSearch} products={products} setDetail={setDetail}/>}
 {view==='results'&&canManageWorkspace(state.user)&&<Analytics user={state.user} users={state.users} products={products} resume={resume} initialOperator={focusOperator} initialTab={pilotageTab||undefined} onOperatorUsed={()=>setFocusOperator('')} features={state.features}/>}
 {view==='progress'&&!canManageWorkspace(state.user)&&<PersonalProgress refreshKey={progressEpoch} resume={resume} features={state.features}/>}
 {view==='contributions'&&canManageWorkspace(state.user)&&<ContributionDashboard openOperator={id=>{setFocusOperator(id);setPilotageTab('journal');go('results');}}/>}
 {view==='protocol'&&<Protocol clinical={state.clinical}/>}
 {view==='admin'&&canManageWorkspace(state.user)&&<Admin state={state} reload={load} notify={notify}/>}
 {view==='account'&&<Account state={state} reload={load}/>}
 </AppShell>;
}
