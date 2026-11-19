import {useState,useEffect,useRef,type ReactNode} from 'react';
import {money,quantityOf,itemsTotal,orderSignature,sameOrder,canManageWorkspace,type Proposal,type ItemSnapshot,type OrderItem,missingAnswers,reviewReason,recommend,manualAddCheck,orderOffer,proposalOriginals,physicalCount,domainOf,safetyNotes,isPack,expand,packUpgrades,searchIds,OUTCOMES,type Profile,type Product,type Tier} from '@touche/domain';
import {reportCache} from '../data/report-cache';
import {setExpectedUser,lockRequests,type RequestError} from '../data/api';
import {announceSession,onSessionMessage,sessionReaction} from '../data/session-channel';
import {allowedView,landingView,viewFromEntry,viewFromSearch,isGuardEntry,viewHref} from '../data/view-history';
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
import {CallModelContext,type CallModel,type RemovalNotice,type CatalogueNotice} from './call/callModel';
import * as callState from './call/callState';
import {CallView} from './call/CallView';

/** One title per view: the nav label, the breadcrumb, the h1 and document.title (« Pilotage – ThinkerCare »). */
const TITLES:Record<string,string>={coverage:'Parcours produits',call:'Appel guidé',catalogue:'Catalogue',results:'Pilotage',progress:'Ma progression',contributions:'Apports & primes',protocol:'Protocole',admin:'Gestion',account:'Mon compte'};
const DOMAINS:Record<string,string>={Visage:'face',Cheveux:'hair',Corps:'body'},DOMAIN_NAMES:Record<string,string>={face:'visage',hair:'cheveux',body:'corps'};
const scopeFilter=(scope:string)=>(p:Product)=>scope==='Tous'||(scope==='Packs'?isPack(p):domainOf(p)===DOMAINS[scope]);

export default function Desk(){
 const [state,setState]=useState<State|null>(null),[loading,setLoading]=useState(true),[fatal,setFatal]=useState(''),[bootError,setBootError]=useState(''),[view,setView]=useState('call'),[signingOut,setSigningOut]=useState(false);
 const [loginNotice,setLoginNotice]=useState(''),[locked,setLocked]=useState(false),[offline,setOffline]=useState(()=>typeof navigator!=='undefined'&&navigator.onLine===false);
 const [progressEpoch,setProgressEpoch]=useState(0),[focusOperator,setFocusOperator]=useState(''),[pilotageTab,setPilotageTab]=useState('');
 // Catalogue and Parcours keep their own search, apart from the call's step-0 search (PN4).
 const [catalogueSearch,setCatalogueSearch]=useState(''),[catalogueScope,setCatalogueScope]=useState('Tous'),[coverageSearch,setCoverageSearch]=useState('');
 // The call: one draft, plus the live call set aside during an example, saved per account in this tab (call/callState.ts).
 const [store,setStore]=useState<callState.CallStore>(()=>({draft:callState.newDraft(),parked:null}));
 const [busy,setBusy]=useState(false),[presenting,setPresenting]=useState(false),[search,setSearch]=useState(''),[scope,setScope]=useState('Tous'),[category,setCategory]=useState('Tous'),[detail,setDetail]=useState<Product|null>(null);
 const [confirmId,setConfirmId]=useState(''),[requestSearch,setRequestSearch]=useState(''),[removal,setRemoval]=useState<RemovalNotice|null>(null),[catalogueNotice,setCatalogueNotice]=useState<CatalogueNotice|null>(null),[clock,setClock]=useState(()=>Date.now());
 const storeRef=useRef(store),stateRef=useRef(state),ownerRef=useRef<string|null>(null),viewRef=useRef(view),lockedRef=useRef(false),callScroll=useRef(0),allowLeave=useRef(false),firstView=useRef(true);
 const {notify:push}=useNotify(),confirmAction=useConfirm();
 /** Results not tied to a control. Errors stay on screen (role="alert") until closed. */
 function notify(title:string,kind:NoteKind='success'){push({kind,title});}

 const current=()=>storeRef.current.draft;
 function replaceStore(next:callState.CallStore){storeRef.current=next;setStore(next);}
 /** Every call change goes through here; a transition that returns null changed nothing. */
 function commit(next:callState.CallDraft|null){if(!next)return false;replaceStore({...storeRef.current,draft:next});return true;}
 function putState(next:State|null){stateRef.current=next;setState(next);}
 function resetScreen(){setConfirmId('');setRequestSearch('');setSearch('');setScope('Tous');setCategory('Tous');setRemoval(null);setCatalogueNotice(null);}
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
 async function leaveApp(){
  if(!(await guardLeaveCall('leave'))){history.pushState({tc:'view',view:viewRef.current},'',viewHref(viewRef.current,location));return;}
  allowLeave.current=true;history.back();
  // Nothing before this tab's first page: stay, and put the current view back on top.
  setTimeout(()=>{allowLeave.current=false;if(isGuardEntry(history.state))history.pushState({tc:'view',view:viewRef.current},'',viewHref(viewRef.current,location));},800);
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
   const asked=login?null:viewFromEntry(history.state)??viewFromSearch(location.search);
   enterView(allowedView(manager,asked)?asked:restored&&callState.isOpenCall(callState.liveCall(restored))?'call':landingView(manager));
  }else if(!allowedView(manager,viewRef.current))enterView(landingView(manager));
  if(login)announceSession({type:'login',userId:next.user.id});
  putState(next);setFatal('');setBootError('');setLoginNotice('');
 }
 async function load(){
  try{acceptState(await api());}
  catch(e){const error=e as RequestError;if(error.status===401)putState(null);else if(error.code==='account-changed')lock();else if(stateRef.current)setFatal(error.message);else setBootError(error.message);}
  finally{setLoading(false);}
 }
 function retryStartup(){setBootError('');setLoading(true);void load();}
 useEffect(()=>{
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
  return()=>{offSession();window.removeEventListener('desk-session-expired',expired);window.removeEventListener('desk-account-changed',changed);window.removeEventListener('popstate',onPop);window.removeEventListener('offline',down);window.removeEventListener('online',up);};
 },[]);
 // The call is saved in this tab on every change (A4); an empty call removes the key.
 useEffect(()=>{if(ownerRef.current)callState.saveCallStore(ownerRef.current,store);},[store]);
 const unsaved=!locked&&callState.needsUnloadPrompt(store);
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
  const what=<>Le brouillon {live.orderRef||'sans référence'} ({units} soin{units>1?'s':''}, {live.presented.length?`offre présentée à ${money(orderOffer(initial,basket,live.tier))}`:'offre non présentée'}){s.draft.demo?', mis de côté pendant l’exemple,':''}</>;
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
 async function startExample(kind:callState.ExampleKind){
  const parks=callState.leavePlan(storeRef.current,'example')==='park';
  if(!(await guardLeaveCall('example')))return;
  startFresh(callState.startExample(storeRef.current,kind));
  if(parks)notify('Appel en cours mis de côté. « Quitter l’exemple » le reprend.','info');
 }
 function exitExample(){const s=storeRef.current;if(!s.draft.demo)return;startFresh(callState.exitExample(s));if(s.parked)notify('Appel en cours repris là où vous l’aviez laissé.','info');}
 async function resume(call:any){if(await guardLeaveCall('resume'))startFresh({draft:callState.resumeDraft(call),parked:null});}

 // ── The call on screen ────────────────────────────────────────────────────────────────────────────────────
 const d=store.draft,products=state?.products||[];
 const {base,upgrade,active:activeBase,initial,companions,basket}=callState.basketOf(d,products);
 const baseId=d.baseIds[0]||'',baseTotal=itemsTotal(initial),profile=d.profile,verifiedProducts=d.verifiedProducts,tier=d.tier;
 const total=itemsTotal(basket),offer=orderOffer(initial,basket,tier),fee=d.delivery===''?null:Number(d.delivery),blocked=reviewReason(profile);
 const candidates=activeBase?recommend(products,activeBase,{...profile,verifiedProducts},companions):[],upgrades=base&&initial.length===1&&!d.upgradeId&&!d.adds.length?packUpgrades(products,base,{...profile,verifiedProducts}):[],count=physicalCount(basket,products),altered=!sameOrder(initial,basket),domain=domainOf(base),notes=safetyNotes(profile),missing=missingAnswers(profile,base);
 const selectedQuantities=Object.fromEntries(basket.map(p=>[p.id,quantityOf(p)]));
 const requestIds=searchIds(products,requestSearch),orderIds=searchIds(products,search);
 const requestable=d.step===2&&activeBase&&!blocked?products.filter(p=>p.enabled&&!d.baseIds.includes(p.id)&&p.id!==activeBase.id&&!d.adds.includes(p.id)&&requestIds.has(p.id)).map(p=>({product:p,check:manualAddCheck(activeBase,companions,p,{...profile,verifiedProducts},products),suggestion:candidates.find(r=>r.product.id===p.id)})):[];
 const suggestionRanks=new Map(candidates.map((r,i)=>[r.product.id,i]));
 const requests=requestable.sort((a,b)=>(suggestionRanks.get(a.product.id)??candidates.length)-(suggestionRanks.get(b.product.id)??candidates.length)||Number(domainOf(b.product)===domain)-Number(domainOf(a.product)===domain));
 const inScope=scopeFilter(scope);
 const visible=products.filter(p=>p.enabled&&inScope(p)&&(category==='Tous'||p.category===category)&&orderIds.has(p.id));
 const matchingOffer=[...d.presented].reverse().find(p=>orderSignature(proposalOriginals(p))===orderSignature(initial)&&p.offerTotal===offer&&p.tier===tier&&p.delivery===fee&&orderSignature(p.products)===orderSignature(basket));
 async function copy(text:string){try{await navigator.clipboard.writeText(text);notify('Récapitulatif copié.');}catch{notify('Copie indisponible : sélectionnez le texte affiché.','error');}}

 /** A change that may remove additions: they are listed with « Annuler » (A3, SPEC). */
 function applyRemoval(previous:callState.CallDraft,r:callState.Revalidated|null,offerUndo=true){
  if(!r||!commit(r.draft))return;
  setConfirmId('');
  // « Annuler » only ever undoes the latest change: a later one keeps the notice but drops its button.
  if(!r.removed.length||!offerUndo){setRemoval(previousNotice=>previousNotice&&{...previousNotice,undo:null});return;}
  const names=r.removed.map(id=>(stateRef.current?.products||[]).find(p=>p.id===id)?.short||id);
  setRemoval({id:Date.now(),names,undo:()=>{commit(callState.undoRemoval(current(),previous));setRemoval(null);}});
 }
 const changeProfile=(patch:Partial<Profile>)=>applyRemoval(current(),callState.changeProfile(current(),patch,products));
 const toggleConcern=(id:string)=>changeProfile(callState.concernPatch(current().profile,id));
 async function changeInitial(ids:string[]){
  const now=current();
  if(callState.orderLocked(now))return;
  if(ids.length>32){notify('Trente-deux références maximum par commande initiale.','error');return;}
  const clears=callState.initialNeedsConfirm(now,ids,products);
  if(clears){
   const next=products.find(p=>p.id===ids[0]);
   if(!(await confirmAction({title:'Changer de produit guide ?',body:<p>{next?.name} relève de l’univers {DOMAIN_NAMES[domainOf(next)]}, les réponses déjà données concernent l’univers {DOMAIN_NAMES[now.profileDomain]||now.profileDomain}. Les réponses et les produits ajoutés seront effacés.</p>,cancelLabel:'Garder la commande actuelle',confirmLabel:'Changer et effacer les réponses',tone:'danger'}))||current()!==now)return;
  }
  applyRemoval(now,callState.changeInitialOrder(now,ids,products),!clears);
 }
 const changeInitialQuantity=(id:string,next:number)=>commit(callState.changeInitialQuantity(current(),id,next));
 function addComplement(id:string,verify:string[],requested:boolean){if(commit(callState.addComplement(current(),id,verify,requested))){setConfirmId('');setRequestSearch('');}}
 function removeComplement(id:string){if(!busy&&!presenting)commit(callState.removeComplement(current(),id));}
 function changeQuantity(id:string,next:number){
  if(busy||presenting)return false;
  const r=callState.changeQuantity(current(),id,next,products);
  if(r&&'error' in r){notify(r.error,'error');return false;}
  return commit(r?.draft??null);
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
   putState(fresh);
   setCatalogueNotice({kind,names:kind==='disabled'?callState.basketOf(current(),fresh.products).basket.filter(p=>!p.enabled).map(p=>p.short||p.name):[]});
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
  if(!base||!altered||blocked||now.saved||presenting)return;
  setPresenting(true);try{
   let proposal:Proposal;
   if(now.demo){const snap=(p:OrderItem):ItemSnapshot=>({id:p.id,name:p.name,price:p.price,quantity:quantityOf(p),components:isPack(p)?expand(p,products).map(x=>({id:x.id,name:x.name,price:x.price})):[]});proposal={id:crypto.randomUUID(),call_id:now.callId,user_id:state!.user.id,created_at:new Date().toISOString(),base:snap(initial[0]),originals:initial.map(snap),products:basket.map(snap),catalogueTotal:total,offerTotal:offer,extra:offer-baseTotal,tier,delivery:fee,version:3};}
   else {
    // One idempotency key per exact offer, kept with the draft so a retry after a reload is the same request.
    const signature=JSON.stringify([now.callId,orderSignature(initial),orderSignature(basket),tier,fee,offer]);
    let key=now.presentationKeys[signature];if(!key){key=crypto.randomUUID();commit({...current(),presentationKeys:{...current().presentationKeys,[signature]:key}});}
    const data=await api({action:'present-offer',id:key,callId:now.callId,baseId,baseIds:now.baseIds,baseQuantities:now.baseQuantities,quantities:selectedQuantities,productIds:basket.map(p=>p.id),upgradeId:now.upgradeId||undefined,tier,delivery:fee,agreedTotal:offer,verifiedProducts:now.verifiedProducts});proposal=data.proposal;
   }
   const latest=current();if(latest.callId!==now.callId)return;
   commit({...latest,presented:[...latest.presented,proposal]});setCatalogueNotice(null);setRemoval(null);
   notify(now.demo?'Exemple : offre simulée, aucune donnée enregistrée.':'Offre présentée enregistrée avec son prix et sa composition.',now.demo?'info':'success');
  }catch(e){await callError(e);}finally{setPresenting(false);}
 }
 const voidable=!!state?.features?.includes('void-call'),voidMinutes=state?.void_window_minutes??30;
 /** « Sans réponse » and « Conserver la commande initiale » were one tap and permanent: they ask first (A2). */
 function outcomeConfirm(outcome:string):ConfirmOptions{
  const after:ReactNode=voidable?<> Vous pourrez l’annuler pendant {voidMinutes} minutes.</>:' Il ne pourra plus être modifié.';
  return outcome==='noanswer'
   ?{title:'Enregistrer « Sans réponse » ?',body:<p>L’appel sera enregistré comme « {OUTCOMES.noanswer} » : cliente non jointe.{after}</p>,cancelLabel:'Revenir à l’appel',confirmLabel:'Enregistrer « Sans réponse »',tone:'primary'}
   :{title:'Conserver la commande initiale ?',body:<p>L’appel sera enregistré sans ajout : la cliente garde sa commande initiale.{after}</p>,cancelLabel:'Revenir à l’appel',confirmLabel:'Enregistrer sans ajout',tone:'primary'};
 }
 async function record(outcome:string){
  const now=current();
  if(!base)return;if(now.demo){notify('Exemple : aucun résultat n’est enregistré.','info');return;}if(now.saved||busy)return;
  const won=['duo','trio','routine'].includes(outcome);
  if(blocked&&won){notify('Vérification ciblée nécessaire.','error');return;}
  if(won&&!matchingOffer){notify('Marquez d’abord cette offre exacte comme présentée.','error');return;}
  if(outcome==='refused'&&!now.presented.length){notify('Pour mesurer un refus d’ajout, marquez l’offre réellement présentée. Sinon, conservez la commande initiale.','error');return;}
  if(outcome==='callback'&&!now.callbackAt){notify('Renseignez la date et l’heure du rappel.','error');return;}
  if(callState.CONFIRMED_OUTCOMES.includes(outcome)&&(!(await confirmAction(outcomeConfirm(outcome)))||current()!==now))return;
  setBusy(true);try{
   await api({action:'save-call',id:now.callId,baseId,baseIds:now.baseIds,baseQuantities:now.baseQuantities,quantities:selectedQuantities,productIds:basket.map(p=>p.id),upgradeId:now.upgradeId||undefined,agreedTotal:offer,outcome,tier:altered?tier:'catalogue',delivery:fee,consent:now.consent,checked:now.checked,refusal:now.refusal,verifiedProducts:now.verifiedProducts,
    meta:{version:3,source:'manual',customerStage:now.customerStage,orderRef:now.orderRef,startedAt:now.startedAt||new Date().toISOString(),eligible:!blocked&&(altered||candidates.length>0||upgrades.length>0||now.presented.length>0),acceptedProposalId:won?matchingOffer!.id:undefined,objections:now.handledObjections,callbackAt:outcome==='callback'?new Date(now.callbackAt+':00+01:00').toISOString():undefined,linkedCallId:now.linkedCallId||undefined}});
   // The screen shows what the server recorded, even if a field was touched during the request.
   if(current().callId===now.callId)commit(callState.markSaved(now,outcome,new Date().toISOString()));
   setRemoval(null);setCatalogueNotice(null);setProgressEpoch(x=>x+1);notify('Résultat enregistré dans le pilotage interne. Aucun système externe modifié.');
  }catch(e){await callError(e);}finally{setBusy(false);}
 }
 /** Voids the saved outcome (H5), then reopens the same call under a new id linked to the voided one. Returns an error text or ''. */
 async function voidCall(reason:string){
  const now=current();if(!now.saved||now.demo)return '';
  try{await api({action:'void-call',id:now.callId,reason});}
  catch(e){const error=e as RequestError;if(error.code!=='already-voided')return error.message;}
  if(current().callId===now.callId)commit(callState.reopenAfterVoid(current()));
  setProgressEpoch(x=>x+1);notify('Résultat annulé. L’appel est rouvert : enregistrez le bon résultat.');
  return '';
 }

 if(locked)return <AccountChangedScreen/>;
 if(loading)return <div className="shell-loading" role="status"><div className="shell-loading__inner"><Wordmark size="lg"/><span className="shell-loading__bar" aria-hidden="true"/><p>Ouverture de votre espace conseil…</p></div></div>;
 if(!state)return bootError?<ConnectionScreen message={bootError} retry={retryStartup}/>:<Login onSuccess={next=>acceptState(next,true)} notice={loginNotice}/>;
 const titles=TITLES;
 // Everything the guided-call components read (call/callModel.tsx); the state itself stays here.
 const call:CallModel={
  step:d.step,toStep,demo:d.demo,saved:d.saved,busy,presenting,
  savedOutcome:d.savedOutcome,savedAt:d.savedAt,canVoid:deadline!==null&&clock<deadline,voidCall,
  newCall:()=>void newCall(),startExample:kind=>void startExample(kind),exitExample,hasParkedCall:!!store.parked,
  orderRef:d.orderRef,setOrderRef:edit('orderRef'),customerStage:d.customerStage,setCustomerStage:edit('customerStage'),linkedCallId:d.linkedCallId,
  products,visible,search,setSearch,scope,setScope,category,setCategory,
  baseId,baseIds:d.baseIds,base,initial,baseTotal,orderLocked:callState.orderLocked(d),changeInitial:ids=>void changeInitial(ids),changeInitialQuantity,
  domain,profile,changeProfile,toggleConcern,blocked,notes,missing,
  upgrades,upgrade,upgradeId:d.upgradeId,chooseUpgrade,clearUpgrade,adds:d.adds,requestedIds:d.requestedIds,
  verifiedProducts,toggleVerified,setDetail,
  candidates,requests,requestSearch,setRequestSearch,confirmId,setConfirmId,addComplement,removeComplement,changeQuantity,
  basket,count,total,altered,tier,chooseTier:(t:Tier)=>commit(callState.chooseTier(current(),t)),offer,delivery:d.delivery,changeDelivery:value=>commit(callState.changeDelivery(current(),value)),fee,copy,
  presented:d.presented,matchingOffer,presentOffer,handledObjections:d.handledObjections,toggleObjection:key=>commit(callState.toggleObjection(current(),key)),
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
