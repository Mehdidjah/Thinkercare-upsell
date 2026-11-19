import { useEffect, useState } from 'react';
import { MEMBER_ROLES, canManageAccount, canManageWorkspace, canRemoveAccount } from '@touche/domain';
import { requestJson } from '../data/api';
import AccountTable, { type AccountUser } from './AccountTable';
import AccountPassword, { NewPasswordField } from './AccountPassword';

type Props = {
  user: AccountUser;
  users: AccountUser[];
  passwordViewingEnabled: boolean;
  reload: () => Promise<void>;
  notify: (message: string) => void;
};

export default function AccountManagement({ user, users, passwordViewingEnabled, reload, notify }: Props) {
  const [username, setUsername] = useState('');
  const [label, setLabel] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('advisor');
  const [account, setAccount] = useState<AccountUser | null>(null);
  const [removing, setRemoving] = useState<AccountUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!account && !removing) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) { setAccount(null); setRemoving(null); setError(''); }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [account, removing, busy]);

  async function save(body: unknown, message: string) {
    setBusy(true); setError('');
    try {
      await requestJson('', body);
      await reload();
      notify(message);
      return true;
    } catch (cause) {
      setError((cause as Error).message);
      return false;
    } finally { setBusy(false); }
  }

  if (!canManageWorkspace(user)) return null;
  return <>
    <section className="admin-section account-section">
      <h2>Comptes et accès</h2>
      <p>Créez un accès Call center, CM ou Manager. Les managers disposent de tous les onglets et options de gestion, sauf la modification du compte Direction.</p>
      <form className="account-form account-create-form" onSubmit={async event => {
        event.preventDefault();
        if (await save({ action: 'user', username, label, password, role }, 'Compte créé.')) {
          setUsername(''); setLabel(''); setPassword(''); setRole('advisor');
        }
      }}>
        <label>Identifiant<input value={username} onChange={e => setUsername(e.target.value)} placeholder="ex. conseil.lina"
          pattern="[a-z0-9._-]{3,40}" required maxLength={40} disabled={busy}/></label>
        <label>Nom affiché<input value={label} onChange={e => setLabel(e.target.value)} required minLength={2} maxLength={80} disabled={busy}/></label>
        <label>Rôle<select value={role} onChange={e => setRole(e.target.value)} disabled={busy}>
          {MEMBER_ROLES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </select></label>
        <NewPasswordField label="Mot de passe initial" value={password} onChange={setPassword} disabled={busy}/>
        <button className="primary" disabled={busy}>Créer l’accès</button>
      </form>
      {error && !account && !removing && <p className="alert" role="alert">{error}</p>}
      <AccountTable user={user} users={users} onManage={target => { setError(''); setAccount({ ...target }); }}
        onRemove={target => { setError(''); setRemoving(target); }}/>
    </section>

    {account && canManageAccount(user, account) && <div className="modal-backdrop">
      <section className="edit-modal" role="dialog" aria-modal="true" aria-label="Gérer un compte">
        <div className="section-head"><h2>{account.username}</h2><button type="button" className="icon-button"
          onClick={() => setAccount(null)} aria-label="Fermer" disabled={busy}>×</button></div>
        <form onSubmit={async event => {
          event.preventDefault();
          if (await save({ action: 'user-settings', id: account.id, label: account.label, team: account.team || '',
            active: account.active !== 0, reporting_scope: 'own', ...(account.role === 'admin' ? {} : { role: account.role }) },
          'Accès et équipe mis à jour.')) setAccount(null);
        }}>
          <label>Nom affiché<input autoFocus value={account.label} onChange={e => setAccount({ ...account, label: e.target.value })}
            minLength={2} maxLength={80} required disabled={busy}/></label>
          <label>Équipe<input value={account.team || ''} onChange={e => setAccount({ ...account, team: e.target.value })}
            maxLength={60} placeholder="Équipe Alger" disabled={busy}/></label>
          {account.role !== 'admin' && <>
            <label>Rôle<select value={account.role} onChange={e => setAccount({ ...account, role: e.target.value })}
              disabled={busy || account.id === user.id}>
              {MEMBER_ROLES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
            </select></label>
            <p className="private-account-note">{account.role === 'manager'
              ? 'Tous les onglets et options de gestion. Le compte Direction reste protégé.'
              : account.role === 'cm' ? 'Un CM dispose des mêmes accès qu’un compte Call center : accès personnel uniquement.'
              : 'Accès personnel uniquement : les résultats des autres comptes ne sont pas accessibles.'}</p>
            <label className="check-row"><input type="checkbox" checked={account.active !== 0}
              disabled={busy || account.id === user.id} onChange={e => setAccount({ ...account, active: e.target.checked ? 1 : 0 })}/>Compte actif</label>
          </>}
          <p className="notice">Un changement de rôle ou une désactivation déconnecte les sessions du compte. Les résultats sont conservés.</p>
          <button className="primary" disabled={busy}>Enregistrer les accès</button>
        </form>
        {error && <p className="alert" role="alert">{error}</p>}
        {account.role !== 'admin' && <AccountPassword key={account.id} account={users.find(u => u.id === account.id) || account}
          enabled={passwordViewingEnabled} request={body => requestJson('', body)} saved={reload}/>}
      </section>
    </div>}

    {removing && canRemoveAccount(user, removing) && <div className="modal-backdrop">
      <section className="edit-modal account-remove-modal" role="dialog" aria-modal="true" aria-labelledby="remove-account-title">
        <h2 id="remove-account-title">Supprimer cet utilisateur ?</h2>
        <p><b>{removing.label}</b> · {removing.username}</p>
        <p>Ce compte sera retiré de la liste et ne pourra plus se connecter. Ses sessions seront déconnectées. Ses appels, ventes et résultats resteront dans les rapports.</p>
        {error && <p className="alert" role="alert">{error}</p>}
        <div className="account-remove-actions">
          <button type="button" className="outline" autoFocus disabled={busy} onClick={() => setRemoving(null)}>Annuler</button>
          <button type="button" className="primary danger-button" disabled={busy} onClick={async () => {
            if (await save({ action: 'remove-user', id: removing.id }, 'Utilisateur supprimé. Ses résultats sont conservés.')) setRemoving(null);
          }}>{busy ? 'Suppression…' : 'Supprimer l’utilisateur'}</button>
        </div>
      </section>
    </div>}
  </>;
}
