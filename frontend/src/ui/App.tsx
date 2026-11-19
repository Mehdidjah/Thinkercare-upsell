import {useState,useEffect,useRef} from 'react';
import {money,quantityOf,itemsTotal,orderSignature,sameOrder,MAX_ITEM_QUANTITY,basketProblem,type OrderItem,canManageWorkspace,type Proposal,type ItemSnapshot,EMPTY_PROFILE,missingAnswers,reviewReason,recommend,manualAddCheck,orderOffer,proposalOriginals,physicalCount,domainOf,safetyNotes,isPack,expand,packUpgrades,type Profile,type Product} from '@touche/domain';
import {reportCache} from '../data/report-cache';
import Analytics from './Analytics';
import {PersonalProgress,ContributionDashboard} from './Commission';
import {ProductModal} from './shared/ProductModal';
import {Wordmark} from './shared/Wordmark';
import {useConfirm} from './shared/Confirm';
import {useNotify,type NoteKind} from './shell/Notifications';
import {normalize} from './shared/catalogue';
import {api} from './shared/api';
import {type State} from './shared/types';
import {Login} from './shell/Login';
import {AppShell} from './shell/AppShell';
import {OfflineBanner} from './shell/OfflineBanner';
import {Catalogue} from './pages/Catalogue';
import {Coverage} from './pages/Coverage';
import {Protocol} from './pages/Protocol';
import {Admin} from './pages/Admin';
import {CallModelContext,type CallModel} from './call/callModel';
import {CallView} from './call/CallView';

export default function Desk(){
 const [state,setState]=useState<State|null>(null),[loading,setLoading]=useState(true),[fatal,setFatal]=useState(''),[view,setView]=useState('call'),[signingOut,setSigningOut]=useState(false);
 const [upgradeId,setUpgradeId]=useState(''),[scope,setScope]=useState('Tous');
 const [progressEpoch,setProgressEpoch]=useState(0),[focusOperator,setFocusOperator]=useState('');
 const presentationKeys=useRef<Record<string,string>>({});
 const [presented,setPresented]=useState<Proposal[]>([]),[presenting,setPresenting]=useState(false),[startedAt,setStartedAt]=useState(''),[orderRef,setOrderRef]=useState(''),[customerStage,setCustomerStage]=useState('unknown'),[callbackAt,setCallbackAt]=useState(''),[handledObjections,setHandledObjections]=useState<string[]>([]),[linkedCallId,setLinkedCallId]=useState(''),[verifiedProducts,setVerifiedProducts]=useState<string[]>([]);
 const [step,setStep]=useState(0),[baseIds,setBaseIds]=useState<string[]>([]),[profile,setProfile]=useState<Profile>({...EMPTY_PROFILE}),[adds,setAdds]=useState<string[]>([]),[tier,setTier]=useState<'catalogue'|'duo'|'final'>('duo'),[delivery,setDelivery]=useState(''),[consent,setConsent]=useState(false),[checked,setChecked]=useState(false),[callId,setCallId]=useState(''),[demo,setDemo]=useState(false),[saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[search,setSearch]=useState(''),[category,setCategory]=useState('Tous'),[detail,setDetail]=useState<Product|null>(null),[refusal,setRefusal]=useState('');
 const [baseQuantities,setBaseQuantities]=useState<Record<string,number>>({}),[quantities,setQuantities]=useState<Record<string,number>>({});
 const [requestedIds,setRequestedIds]=useState<string[]>([]),[confirmId,setConfirmId]=useState(''),[requestSearch,setRequestSearch]=useState('');
 function acceptState(next:State){reportCache.setUser(next.user.id);setState(next);setFatal('');}
 async function load(){try{acceptState(await api());setFatal('');}catch(e){if((e as any).status===401)setState(null);else setFatal((e as Error).message);}finally{setLoading(false);}}
 useEffect(()=>{void load();const expired=()=>{setState(null);reset();};window.addEventListener('desk-session-expired',expired);return()=>window.removeEventListener('desk-session-expired',expired);},[]);
 async function signOut(){
  if(signingOut)return;
  setSigningOut(true);
  try{await api({action:'logout'});}
  catch(error){if((error as {status?:number}).status!==401){notify('Déconnexion impossible. Vérifiez votre connexion et réessayez.','error');return;}}
  finally{setSigningOut(false);}
  setState(null);reset();setDetail(null);setFatal('');setFocusOperator('');
 }
 const {notify:push}=useNotify(),confirmAction=useConfirm();
 /** Results not tied to a control. Errors stay on screen (role="alert") until closed. */
 function notify(title:string,kind:NoteKind='success'){push({kind,title});}
 function clearRequests(){setRequestedIds([]);setConfirmId('');setRequestSearch('');setQuantities({});}
 function addComplement(id:string,verify:string[],requested:boolean){if(saved)return;if(verify.length)setVerifiedProducts(a=>[...new Set([...a,...verify])]);setAdds(a=>a.includes(id)?a:[...a,id]);setConsent(false);setChecked(false);if(requested)setRequestedIds(a=>a.includes(id)?a:[...a,id]);setConfirmId('');setRequestSearch('');}
 function reset(example=false,hair=false){
  presentationKeys.current={};setPresented([]);setStartedAt(new Date().toISOString());setOrderRef('');setCustomerStage('unknown');setCallbackAt('');setHandledObjections([]);setLinkedCallId('');setVerifiedProducts([]);
  setBaseQuantities({});setStep(example?1:0);setBaseIds(example?[hair?'shpousse':'antiacne']:[]);setUpgradeId('');setScope('Tous');
  setProfile(example?{...EMPTY_PROFILE,concerns:hair?['growth','breakage']:['acne'],skin:'mixed',sensitive:'no',routine:[],routineKnown:true,safety:['none'],severity:hair?'':'mild'}:{...EMPTY_PROFILE});
  setAdds([]);clearRequests();setTier('duo');setDelivery('');setConsent(false);setChecked(false);setRefusal('');setCallId(crypto.randomUUID());setDemo(example);setSaved(false);setView('call');setSearch('');setCategory('Tous');
 }
 function changeInitial(ids:string[]){
  if(saved||presented.length)return;
  if(ids.length>32){notify('Trente-deux références maximum par commande initiale.','error');return;}
  setBaseQuantities(previous=>Object.fromEntries(ids.map(id=>[id,previous[id]||1])));setBaseIds(ids);setUpgradeId('');setProfile({...EMPTY_PROFILE});setVerifiedProducts([]);setHandledObjections([]);setStartedAt(new Date().toISOString());setAdds([]);clearRequests();setConsent(false);setChecked(false);setTier('duo');setCallId(crypto.randomUUID());
 }
 const baseId=baseIds[0]||'';
 const products=state?.products||[],base=products.find(p=>p.id===baseId),upgrade=products.find(p=>p.id===upgradeId),activeBase=upgrade||base;
 const initial:OrderItem[]=baseIds.map(id=>products.find(p=>p.id===id)).filter((p):p is Product=>!!p).map(p=>({...p,quantity:baseQuantities[p.id]||1})),baseTotal=itemsTotal(initial);
 const added=adds.map(id=>products.find(p=>p.id===id)).filter(Boolean) as Product[],companions=[...initial.slice(1),...added];
 const basket:OrderItem[]=activeBase?[activeBase,...companions].map(p=>({...p,quantity:quantities[p.id]??(p.id===upgradeId?baseQuantities[baseId]:baseQuantities[p.id])??1})):[];
 const total=itemsTotal(basket),offer=orderOffer(initial,basket,tier),fee=delivery===''?null:Number(delivery),blocked=reviewReason(profile);
 const candidates=activeBase?recommend(products,activeBase,{...profile,verifiedProducts},companions):[],upgrades=base&&initial.length===1&&!upgradeId&&!adds.length?packUpgrades(products,base,{...profile,verifiedProducts}):[],count=physicalCount(basket,products),altered=!sameOrder(initial,basket),domain=domainOf(base),notes=safetyNotes(profile),missing=missingAnswers(profile,base);
 function changeInitialQuantity(id:string,next:number){
  if(saved||presented.length||!Number.isSafeInteger(next)||next<1||next>MAX_ITEM_QUANTITY)return false;
  changeInitial(baseIds);setBaseQuantities(previous=>({...previous,[id]:next}));return true;
 }
 function changeQuantity(id:string,next:number){
  if(saved||busy||presenting||!Number.isSafeInteger(next)||next<1||next>MAX_ITEM_QUANTITY)return false;
  const item=basket.find(p=>p.id===id);if(!item)return false;
  const minimum=id===upgradeId?quantityOf(initial[0]):quantityOf(initial.find(p=>p.id===id)||{quantity:1});
  if(next<minimum)return false;
  if(next>quantityOf(item)&&(!item.recommendable||item.verificationRequired)&&!verifiedProducts.includes(id)){notify('Confirmez la vérification de cette référence avant d’augmenter la quantité.','error');return false;}
  const problem=basketProblem(basket.map(p=>p.id===id?{...p,quantity:next}:p),products);if(problem&&next>quantityOf(item)){notify(problem,'error');return false;}
  setQuantities(previous=>({...previous,[id]:next}));setConsent(false);setChecked(false);return true;
 }
 function removeComplement(id:string){if(saved||busy||presenting)return;setAdds(a=>a.filter(x=>x!==id));setQuantities(previous=>{const next={...previous};delete next[id];return next});setRequestedIds(a=>a.filter(x=>x!==id));setConsent(false);setChecked(false);}
 const selectedQuantities=Object.fromEntries(basket.map(p=>[p.id,quantityOf(p)]));
 const requestable=step===2&&activeBase&&!blocked?products.filter(p=>p.enabled&&!baseIds.includes(p.id)&&p.id!==activeBase.id&&!adds.includes(p.id)&&normalize(p.name+' '+p.short+' '+p.category).includes(normalize(requestSearch))).map(p=>({product:p,check:manualAddCheck(activeBase,companions,p,{...profile,verifiedProducts},products),suggestion:candidates.find(r=>r.product.id===p.id)})):[];
 const suggestionRanks=new Map(candidates.map((r,i)=>[r.product.id,i]));
 const requests=requestable.sort((a,b)=>(suggestionRanks.get(a.product.id)??candidates.length)-(suggestionRanks.get(b.product.id)??candidates.length)||Number(domainOf(b.product)===domain)-Number(domainOf(a.product)===domain));
 const inScope=(p:Product)=>scope==='Tous'||(scope==='Packs'?isPack(p):domainOf(p)===({Visage:'face',Cheveux:'hair',Corps:'body'} as Record<string,string>)[scope]);
 const visible=products.filter(p=>p.enabled&&inScope(p)&&(category==='Tous'||p.category===category)&&normalize(p.name+' '+p.description).includes(normalize(search)));
 async function copy(text:string){try{await navigator.clipboard.writeText(text);notify('Récapitulatif copié.');}catch{notify('Copie indisponible : sélectionnez le texte affiché.','error');}}
 const matchingOffer=[...presented].reverse().find(p=>orderSignature(proposalOriginals(p))===orderSignature(initial)&&p.offerTotal===offer&&p.tier===tier&&p.delivery===fee&&orderSignature(p.products)===orderSignature(basket));
 async function presentOffer(){
  if(!base||!altered||blocked||saved)return;
  setPresenting(true);try{const id=callId||crypto.randomUUID();if(!callId)setCallId(id);
   let proposal:Proposal;
   if(demo){const snap=(p:OrderItem):ItemSnapshot=>({id:p.id,name:p.name,price:p.price,quantity:quantityOf(p),components:isPack(p)?expand(p,products).map(x=>({id:x.id,name:x.name,price:x.price})):[]});proposal={id:crypto.randomUUID(),call_id:id,user_id:state!.user.id,created_at:new Date().toISOString(),base:snap(initial[0]),originals:initial.map(snap),products:basket.map(snap),catalogueTotal:total,offerTotal:offer,extra:offer-baseTotal,tier,delivery:fee,version:3};}
   else {const signature=JSON.stringify([id,orderSignature(initial),orderSignature(basket),tier,fee,offer]);const proposalId=presentationKeys.current[signature]||(presentationKeys.current[signature]=crypto.randomUUID());const data=await api({action:'present-offer',id:proposalId,callId:id,baseId,baseIds,baseQuantities,quantities:selectedQuantities,productIds:basket.map(p=>p.id),upgradeId:upgradeId||undefined,tier,delivery:fee,agreedTotal:offer,verifiedProducts});proposal=data.proposal;}
   setPresented(p=>[...p,proposal]);notify(demo?'Exemple : offre simulée, aucune donnée enregistrée.':'Offre présentée enregistrée avec son prix et sa composition.',demo?'info':'success');
  }catch(e){notify((e as Error).message,'error')}finally{setPresenting(false)}
 }
 async function record(outcome:string){
  if(!base)return;if(demo){notify('Exemple : aucun résultat n’est enregistré.','info');return;}if(saved)return;
  const won=['duo','trio','routine'].includes(outcome);
  if(blocked&&won){notify('Vérification ciblée nécessaire.','error');return;}
  if(won&&!matchingOffer){notify('Marquez d’abord cette offre exacte comme présentée.','error');return;}
  if(outcome==='refused'&&!presented.length){notify('Pour mesurer un refus d’ajout, marquez l’offre réellement présentée. Sinon, conservez la commande initiale.','error');return;}
  if(outcome==='callback'&&!callbackAt){notify('Renseignez la date et l’heure du rappel.','error');return;}
  setBusy(true);try{const id=callId||crypto.randomUUID();if(!callId)setCallId(id);
   await api({action:'save-call',id,baseId,baseIds,baseQuantities,quantities:selectedQuantities,productIds:basket.map(p=>p.id),upgradeId:upgradeId||undefined,agreedTotal:offer,outcome,tier:altered?tier:'catalogue',delivery:fee,consent,checked,refusal,verifiedProducts,
    meta:{version:3,source:'manual',customerStage,orderRef,startedAt:startedAt||new Date().toISOString(),eligible:!blocked&&(altered||candidates.length>0||upgrades.length>0||presented.length>0),acceptedProposalId:won?matchingOffer!.id:undefined,objections:handledObjections,callbackAt:outcome==='callback'?new Date(callbackAt+':00+01:00').toISOString():undefined,linkedCallId:linkedCallId||undefined}});
   setSaved(true);setProgressEpoch(x=>x+1);notify('Résultat enregistré dans le pilotage interne. Aucun système externe modifié.');
  }catch(e){notify((e as Error).message,'error')}finally{setBusy(false)}
 }
 /** Leaving an unsaved live call asks first (replaces window.confirm; same conditions as before). */
 async function guardLeaveCall(){
  if(!baseId||saved||demo)return true;
  return confirmAction({title:'Abandonner l’appel en cours ?',body:<p>Le brouillon {orderRef||'sans référence'} ({count} soin{count>1?'s':''}, {presented.length?`offre présentée à ${money(offer)}`:'offre non présentée'}) sera supprimé.</p>,cancelLabel:'Reprendre l’appel',confirmLabel:'Abandonner l’appel',tone:'danger'});
 }
 async function newCall(){if(await guardLeaveCall())reset();}
 async function resume(call:any){if(!(await guardLeaveCall()))return;reset();setBaseQuantities(Object.fromEntries((call.meta?.originals||[call.meta?.original].filter(Boolean)).map((p:ItemSnapshot)=>[p.id,quantityOf(p)])));setBaseIds(call.meta?.originals?.length?call.meta.originals.map((p:ItemSnapshot)=>p.id):[call.base_id]);setOrderRef(call.meta?.orderRef||call.order_ref||'');setCustomerStage(call.meta?.customerStage||'unknown');setLinkedCallId(call.id);setStep(1);}

 if(loading)return <div className="shell-loading" role="status"><div className="shell-loading__inner"><Wordmark size="lg"/><span className="shell-loading__bar" aria-hidden="true"/><p>Ouverture de votre espace conseil…</p></div></div>;
 if(!state)return <>{fatal&&<OfflineBanner fatal={fatal} load={load}/>}<Login onSuccess={acceptState}/></>;
 const titles:Record<string,string>={coverage:'Parcours produits',call:'Appel guidé',catalogue:'Catalogue',results:'Pilotage',progress:'Ma progression',contributions:'Apports & primes',protocol:'Protocole',admin:canManageWorkspace(state.user)?'Gestion':'Mon compte'};
 const changeProfile=(patch:Partial<Profile>)=>{setProfile(p=>({...p,...patch}));setUpgradeId('');setAdds([]);clearRequests();setConsent(false);setChecked(false);};
 const toggleConcern=(id:string)=>{const a=profile.concerns.includes(id)?profile.concerns.filter(x=>x!==id):profile.concerns.length<2?[...profile.concerns,id]:[profile.concerns[0],id];changeProfile({concerns:a,severity:a.includes('acne')?profile.severity:'',marks:a.includes('marks')?profile.marks:'',hairPattern:a.includes('fall')?profile.hairPattern:'',redState:a.includes('red')?profile.redState:''});};
 const toStep=(n:number)=>{setStep(n);setTimeout(()=>document.getElementById('workflow-heading')?.focus(),0);};
 // Everything the guided-call components read (call/callModel.tsx); the state itself stays here.
 const call:CallModel={
  step,toStep,reset,demo,saved,busy,presenting,
  orderRef,setOrderRef,customerStage,setCustomerStage,linkedCallId,
  products,visible,search,setSearch,scope,setScope,category,setCategory,
  baseId,baseIds,base,initial,baseTotal,changeInitial,changeInitialQuantity,
  domain,profile,changeProfile,toggleConcern,blocked,notes,missing,
  upgrades,upgrade,upgradeId,setUpgradeId,adds,setAdds,requestedIds,clearRequests,
  verifiedProducts,setVerifiedProducts,setDetail,
  candidates,requests,requestSearch,setRequestSearch,confirmId,setConfirmId,addComplement,removeComplement,changeQuantity,
  basket,count,total,altered,tier,setTier,offer,delivery,setDelivery,fee,copy,
  presented,matchingOffer,presentOffer,handledObjections,setHandledObjections,
  consent,setConsent,checked,setChecked,callbackAt,setCallbackAt,refusal,setRefusal,record};

 return <AppShell state={state} view={view} setView={setView} titles={titles} signingOut={signingOut} signOut={signOut} newCall={()=>void newCall()} fatal={fatal} load={load} modal={detail&&<ProductModal detail={detail} setDetail={setDetail} products={products}/>}>
 {view==='call'&&!canManageWorkspace(state.user)&&<PersonalProgress compact refreshKey={progressEpoch}/>}
 {view==='call'&&<CallModelContext value={call}><CallView/></CallModelContext>}
 {view==='catalogue'&&<Catalogue search={search} setSearch={setSearch} scope={scope} setScope={setScope} products={products} inScope={inScope} setDetail={setDetail}/>}
 {view==='coverage'&&<Coverage search={search} setSearch={setSearch} products={products} setDetail={setDetail}/>}
 {view==='results'&&canManageWorkspace(state.user)&&<Analytics user={state.user} users={state.users} products={products} resume={resume} initialOperator={focusOperator}/>}
 {view==='progress'&&!canManageWorkspace(state.user)&&<PersonalProgress refreshKey={progressEpoch} resume={resume}/>}
 {view==='contributions'&&canManageWorkspace(state.user)&&<ContributionDashboard openOperator={id=>{setFocusOperator(id);setView('results')}}/>}
 {view==='protocol'&&<Protocol clinical={state.clinical}/>}
 {view==='admin'&&<Admin state={state} reload={load} notify={notify}/>}
 </AppShell>;
}
