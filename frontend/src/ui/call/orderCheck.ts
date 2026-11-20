import {BRAND_PREFIXES,ORDER_REFERENCE_HINT,type Brand,normalizeOrderReference,orderReferenceHint,parseBrandReference,referenceBrandMismatch} from '@touche/domain';

/** The EcoManager check of the dossier reference, while the adviser types it, in the store of the call's brand (server
 *  features `order-check` for the TOU store, `order-check-bel` for the BEL store). */
export type OrderCheckStatus='idle'|'invalid'|'checking'|'verified'|'not-found'|'unavailable';
export type CheckedOrder={id:number;reference:string;stateGroup:string;stateLabel:string;stateName:string|null};
export type OrderCheck={reference:string;status:OrderCheckStatus;order?:CheckedOrder;message?:string};

/** A check starts only for a complete reference of the call's store (TOU or BEL + number, or the number alone); anything
 *  else, another store's reference included, is explained at once. */
export function startCheck(raw:string,brand:Brand='touche'):OrderCheck{
 const reference=normalizeOrderReference(raw);
 if(!reference)return {reference,status:'idle'};
 const parsed=parseBrandReference(reference,brand);
 if(!parsed)return {reference,status:'invalid',message:orderReferenceHint(brand)};
 return parsed.brand===brand?{reference,status:'checking'}:{reference,status:'invalid',message:referenceBrandMismatch(parsed.brand,brand)};
}

/** The store of the call's brand is checked only when the server lists it: an older server knows the TOU store only. */
export const orderCheckEnabled=(features:string[]|undefined,brand:Brand):boolean=>!!features?.includes(brand==='belnco'?'order-check-bel':'order-check');

/** The lookup names the BEL store; a Touché lookup stays the request older servers know. */
export const orderLookupQuery=(reference:string,brand:Brand):string=>'?action=order&ref='+encodeURIComponent(reference)+(brand==='belnco'?'&brand=belnco':'');

/** An example reference of the call's store (a BEL.NCO number alone is saved as BEL… even unchecked). */
export const referencePlaceholder=(brand:Brand,checked:boolean):string=>brand==='belnco'?BRAND_PREFIXES[brand]+'1763838':checked?'TOU1763816':'DOS-0142';

/** The lookup's answer: the order (its full reference becomes the check's reference) or « EcoManager ne répond pas ». */
export function checkFromResponse(reference:string,body:{check?:string;order?:CheckedOrder|null;message?:string}):OrderCheck{
 if(body.check==='verified'&&body.order)return {reference:body.order.reference,status:'verified',order:body.order};
 return {reference,status:'unavailable',...(body.message?{message:body.message}:{})};
}

/** A refused lookup: unknown order, malformed reference and another store's reference block the save; anything else lets
 *  the call go on « à vérifier ». */
export function checkFromError(reference:string,error:{status?:number;code?:string;message?:string}):OrderCheck{
 if(error.code==='order-not-found')return {reference,status:'not-found',message:error.message||'Commande introuvable dans EcoManager.'};
 if(error.code==='order-ref-format'||error.code==='order-ref-brand')return {reference,status:'invalid',message:error.message||ORDER_REFERENCE_HINT};
 return {reference,status:'unavailable',...(error.message?{message:error.message}:{})};
}

/** Why the call cannot be saved yet with this reference, or null: verified, or EcoManager unreachable (saved « à vérifier »). */
export function orderCheckBlocksSave(check:OrderCheck,ref:string):string|null{
 const reference=normalizeOrderReference(ref);
 if(check.status==='verified')return check.reference===reference||check.order?.reference===reference?null:'La référence a changé : vérifiez-la de nouveau dans EcoManager.';
 if(check.reference!==reference||check.status==='idle')return 'Vérifiez la commande dans EcoManager avant d’enregistrer.';
 if(check.status==='unavailable')return null;
 if(check.status==='checking')return 'Vérification de la commande en cours… Réessayez dans un instant.';
 return check.message||ORDER_REFERENCE_HINT;
}

/** Why the call cannot move on to step `to` yet: every later step needs the dossier reference (going back, examples
 *  and saved calls aside). With EcoManager on, the order is checked as well before the move (App.goStep). */
export function advanceBlocker(call:{step:number;demo:boolean;saved:boolean;orderRef:string},to:number):string|null{
 return to>call.step&&!call.demo&&!call.saved&&!call.orderRef.trim()?'Renseignez la référence du dossier avant de passer à l’étape suivante.':null;
}
