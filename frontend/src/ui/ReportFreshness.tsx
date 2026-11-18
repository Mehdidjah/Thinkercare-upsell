export default function ReportFreshness({ at, busy, error, label = 'Actualisé' }: { at: string; busy: boolean; error?: string; label?: string }) {
  const time = at ? new Date(at).toLocaleTimeString('fr-FR', {
    timeZone: 'Africa/Algiers', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }) : '';
  return <p className="report-freshness">
    {error ? 'Actualisation interrompue. Réessayez ou vérifiez la connexion.'
      : busy ? 'Actualisation en cours…'
      : time ? `${label} à ${time} (Alger).` : 'En attente des données.'}
    {' '}Mise à jour automatique toutes les 30 s et au retour sur cette page.
  </p>;
}
