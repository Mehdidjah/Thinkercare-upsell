import {useId} from 'react';
import {Dialog} from '../shared/Dialog';
import {Icon} from '../shared/Icon';
import {useCall} from './callModel';

/** The browser refused the copy (permissions, older browser): the text itself, selected, to copy by hand (COPY). */
export function CopyFallback(){const {copyFallback,closeCopyFallback}=useCall();
 const titleId=useId(),helpId=useId();
 if(!copyFallback)return null;
 const what=copyFallback.label.replace(/ copiée?\.$/,'').toLowerCase();
 return <Dialog open onClose={closeCopyFallback} labelledBy={titleId}>
  <div className="dialog__head"><h2 id={titleId} className="dialog__title" data-dialog-title tabIndex={-1}>Copie automatique indisponible</h2><button type="button" className="icon-btn dialog__close" aria-label="Fermer" onClick={closeCopyFallback}><Icon name="close"/></button></div>
  <div className="dialog__body">
   <p id={helpId}>Le navigateur n’a pas autorisé la copie. Le texte ({what}) est sélectionné ci-dessous : copiez-le avec Ctrl+C, ou par un appui long sur téléphone.</p>
   <textarea className="call-copy__text" readOnly data-autofocus aria-label={'Texte à copier : '+what} aria-describedby={helpId} value={copyFallback.text} rows={Math.min(14,copyFallback.text.split('\n').length+1)} onFocus={e=>e.currentTarget.select()}/>
  </div>
  <div className="dialog__actions"><button type="button" className="btn btn--secondary" onClick={closeCopyFallback}>Fermer</button></div>
 </Dialog>;
}
