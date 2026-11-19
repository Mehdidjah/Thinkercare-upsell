import {useId} from 'react';
import {money,type Tier} from '@touche/domain';
import {Button} from '../shared/Button';
import {DisabledReason} from '../shared/DisabledReason';
import {Icon} from '../shared/Icon';
import {useCall} from './callModel';
import {reveal} from './reveal';

const TIER_NAMES:Record<Tier,string>={catalogue:'prix catalogue',duo:'première offre',final:'offre finale'};
/** The price options on screen (the rail's, or the step-3 block's under 1024px). */
const visiblePrice=()=>[...document.querySelectorAll<HTMLElement>('.call-price')].find(el=>el.offsetParent!==null);

/**
 * Step 03 · sticky action bar, like steps 01 and 02 (STEP3): the current offer and « J’ai présenté · prix » stay in reach
 * below the picker and the coach. A price that does not raise the initial order keeps the button focusable with its reason
 * (M5, B3). Once the offer is traced, the bar leads to the close-out.
 */
export function OfferBar(){const {saved,presenting,altered,count,baseTotal,tier,offer,fee,offerIssue,matchingOffer,presentOffer}=useCall();
 const reasonId=useId();
 if(saved)return null;
 const toClose=()=>reveal(document.getElementById('call-close-title'),'start');
 const toPrice=()=>reveal(visiblePrice()?.querySelector<HTMLElement>('[aria-pressed="true"]')??visiblePrice(),'center');
 return <div className="call-actions call-actions--offer">
  {!altered
   ?<><p className="call-actions__status">Pas d’ajout pour l’instant : commande initiale à <span className="num">{money(baseTotal)}</span>. Ajoutez un produit pour construire l’offre.</p><Button variant="secondary" onClick={toClose}>Clôturer l’appel<Icon name="arrow"/></Button></>
   :matchingOffer
    ?<><p className="call-actions__status call-actions__status--done"><Icon name="check"/><span>Offre tracée à <b className="num">{money(offer)}</b>. Enregistrez la réponse de la cliente.</span></p><Button variant="primary" onClick={toClose}>Clôturer l’appel<Icon name="arrow"/></Button></>
    :<>{offerIssue
      ?<DisabledReason id={reasonId} title="Pour présenter cette offre :" items={[{label:offerIssue,done:false}]}/>
      :<p className="call-actions__status">{count} unité{count>1?'s':''}, {TIER_NAMES[tier]}{fee!==null?<>, livraison <span className="num">{money(fee)}</span></>:', livraison à confirmer'}.</p>}
     <Button variant="primary" busy={presenting} busyLabel="Enregistrement…" blocked={!!offerIssue} reasonId={reasonId} onBlocked={toPrice} onClick={()=>void presentOffer()}>J’ai présenté · <span className="num">{money(offer)}</span></Button></>}
 </div>;
}
