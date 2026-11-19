import { Icon } from './shared/Icon';

const clock = (at: string, seconds = true) => new Date(at).toLocaleTimeString('fr-FR', {
  timeZone: 'Africa/Algiers', hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}),
});

/** The quiet freshness line under a report title. Never a live region: the 30 s refresh is silent. */
export default function ReportFreshness({ at, busy, error, label = 'Actualisé' }: { at: string; busy: boolean; error?: string; label?: string }) {
  const time = at ? clock(at) : '';
  return <p className="report-freshness">
    {error && !time ? 'Actualisation interrompue. Réessayez ou vérifiez la connexion.'
      : busy ? 'Actualisation en cours…'
      : time ? `${label} à ${time} (Alger).` : 'En attente des données.'}
    {' '}Mise à jour automatique toutes les 30 s et au retour sur cette page.
  </p>;
}

/** A refresh failed but the previous data is still shown (PN2): say how old it is, keep it readable.
 *  `compact`: one line inside the progress strip on the call. */
export function StaleNotice({ at, onRetry, compact = false }: { at: string; onRetry?: () => void; compact?: boolean }) {
  const text = at ? `Données de ${clock(at, false)} : actualisation impossible.` : 'Données affichées : actualisation impossible.';
  if (compact) return <p className="report-stale report-stale--compact" role="status"><Icon name="alert"/><span>{text}</span></p>;
  return <div className="notice notice--warning report-stale" role="status">
    <Icon name="alert" className="notice__icon"/>
    <p className="notice__text">{text}</p>
    {onRetry && <button type="button" className="link-btn" onClick={onRetry}>Réessayer</button>}
  </div>;
}
