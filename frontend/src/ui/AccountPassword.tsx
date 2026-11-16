import { useEffect, useId, useState, type FormEvent } from 'react';

export function NewPasswordField({ value, onChange, disabled = false, label = 'Nouveau mot de passe' }: {
  value: string; onChange: (value: string) => void; disabled?: boolean; label?: string;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  function generate() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    onChange(Array.from(crypto.getRandomValues(new Uint8Array(24)), byte => alphabet[byte % 64]).join(''));
    setVisible(true);
  }
  return <div className="password-field">
    <label htmlFor={id}>{label}<input id={id} type={visible ? 'text' : 'password'} autoComplete="new-password"
      value={value} onChange={e => onChange(e.target.value)} minLength={14} maxLength={200}
      placeholder="14 caractères minimum" required disabled={disabled}/></label>
    <div className="password-actions">
      <button type="button" className="text-button" onClick={generate} disabled={disabled}>Générer</button>
      <button type="button" className="text-button" aria-controls={id} aria-pressed={visible}
        onClick={() => setVisible(!visible)} disabled={disabled}>{visible ? 'Masquer' : 'Afficher la saisie'}</button>
    </div>
  </div>;
}

export default function AccountPassword({ account, enabled, request, saved }: {
  account: { id: string; username: string; password_available?: boolean; password_updated_at?: string | null };
  enabled: boolean;
  request: (body: unknown) => Promise<{ password?: string | null }>;
  saved: () => Promise<void>;
}) {
  const [password, setPassword] = useState<string | null>(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [replacement, setReplacement] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (password === null) return;
    const timer = window.setTimeout(() => setPassword(null), 60000);
    const hide = () => { if (document.hidden) setPassword(null); };
    document.addEventListener('visibilitychange', hide);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', hide); };
  }, [password]);

  async function reveal() {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await request({ action: 'user-password', id: account.id, adminPassword });
      setPassword(result.password ?? null);
      if (!result.password) setMessage('Ancien mot de passe non récupérable. Définissez un nouveau mot de passe ci-dessous.');
      setConfirming(false);
    } catch (error) { setError((error as Error).message); }
    finally { setAdminPassword(''); setBusy(false); }
  }

  async function reset(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage(''); setPassword(null); setConfirming(false); setAdminPassword('');
    try {
      await request({ action: 'reset-user', id: account.id, password: replacement });
      setReplacement('');
      setMessage('Nouveau mot de passe enregistré. Les anciennes sessions sont déconnectées.');
      await saved();
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }

  return <section className="account-password" aria-label="Mot de passe du compte">
    <h3>Mot de passe de {account.username}</h3>
    <p>{account.password_updated_at
      ? 'Dernier enregistrement : ' + new Date(account.password_updated_at).toLocaleString('fr-FR')
      : 'Mot de passe enregistré. Date du dernier changement non disponible.'}</p>
    {!enabled ? <p>La consultation des mots de passe n’est pas encore activée sur ce serveur. Vous pouvez définir un nouveau mot de passe ci-dessous.</p>
      : !account.password_available ? <p>Ce mot de passe ancien ne peut pas être récupéré. Il sera consultable après le prochain changement ou une réinitialisation.</p>
      : password !== null ? <div className="password-revealed">
        <output aria-label="Mot de passe enregistré">{password}</output>
        <div className="password-actions">
          <button type="button" className="text-button" onClick={async () => {
            try { await navigator.clipboard.writeText(password); setMessage('Mot de passe copié.'); }
            catch { setError('Copie indisponible. Sélectionnez le mot de passe affiché.'); }
          }}>Copier</button>
          <button type="button" className="text-button" onClick={() => setPassword(null)}>Masquer</button>
        </div>
        <small>Masqué après une minute ou lorsque vous quittez cet onglet.</small>
      </div> : confirming ? <div className="password-confirmation">
        <label>Votre mot de passe administrateur<input type="password" autoComplete="current-password"
          value={adminPassword} onChange={e => setAdminPassword(e.target.value)} maxLength={200} disabled={busy}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (adminPassword && !busy) void reveal(); } }}/></label>
        <div className="password-actions">
          <button type="button" className="outline" onClick={() => void reveal()} disabled={busy || !adminPassword}>Confirmer et afficher</button>
          <button type="button" className="text-button" disabled={busy} onClick={() => { setConfirming(false); setAdminPassword(''); }}>Annuler</button>
        </div>
      </div> : <button type="button" className="outline" disabled={busy} onClick={() => { setConfirming(true); setError(''); setMessage(''); }}>Voir le mot de passe enregistré</button>}
    {enabled && <p className="muted">La consultation est réservée à la direction et enregistrée dans le journal de traçabilité.</p>}
    <form onSubmit={reset}>
      <NewPasswordField value={replacement} onChange={setReplacement} disabled={busy}/>
      <p>Le nouveau mot de passe remplace immédiatement l’ancien et déconnecte les sessions de cette conseillère.</p>
      <button className="primary" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer le nouveau mot de passe'}</button>
    </form>
    {error && <p className="alert" role="alert">{error}</p>}
    {message && <p className="notice" role="status">{message}</p>}
  </section>;
}
