import {ORDER_REFERENCE_HINT,normalizeOrderReference,parseOrderReference} from '@touche/domain';

/** The EcoManager check of the dossier reference, while the adviser types it (server feature `order-check`). */
export type OrderCheckStatus='idle'|'invalid'|'checking'|'verified'|'not-found'|'unavailable';
export type CheckedOrder={id:number;reference:string;stateGroup:string;stateLabel:string;stateName:string|null};
export type OrderCheck={reference:string;status:OrderCheckStatus;order?:CheckedOrder;message?:string};

/** A check starts only for a complete reference (TOU + number, or the number alone); anything else is explained at once. */
export function startCheck(raw:string):OrderCheck{
 const reference=normalizeOrderReference(raw);
 if(!reference)return {reference,status:'idle'};
 return parseOrderReference(reference)?{reference,status:'checking'}:{reference,status:'invalid',message:ORDER_REFERENCE_HINT};
}

/** The lookup's answer: the order (its full reference becomes the check's reference) or « EcoManager ne répond pas ». */
export function checkFromResponse(reference:string,body:{check?:string;order?:CheckedOrder|null;message?:string}):OrderCheck{
 if(body.check==='verified'&&body.order)return {reference:body.order.reference,status:'verified',order:body.order};
 return {reference,status:'unavailable',...(body.message?{message:body.message}:{})};
}

/** A refused lookup: unknown order and malformed reference block the save; anything else lets the call go on « à vérifier ». */
export function checkFromError(reference:string,error:{status?:number;code?:string;message?:string}):OrderCheck{
 if(error.code==='order-not-found')return {reference,status:'not-found',message:error.message||'Commande introuvable dans EcoManager.'};
 if(error.code==='order-ref-format')return {reference,status:'invalid',message:error.message||ORDER_REFERENCE_HINT};
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
