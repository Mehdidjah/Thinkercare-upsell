import { accountRoleLabel, canManageAccount, canRemoveAccount } from '@touche/domain';

export type AccountUser = {
  id: string;
  username: string;
  label: string;
  role: string;
  active?: number;
  team?: string;
  reporting_scope?: string;
  password_available?: boolean;
  password_updated_at?: string | null;
};

export default function AccountTable({ user: actor, users, onManage, onRemove }: {
  user: AccountUser;
  users: AccountUser[];
  onManage: (user: AccountUser) => void;
  onRemove: (user: AccountUser) => void;
}) {
  return <div className="account-table-wrap">
    <table className="account-table" aria-label="Comptes et autorisations" role="table">
      <thead role="rowgroup">
        <tr role="row">
          <th scope="col" role="columnheader">Compte</th>
          <th scope="col" role="columnheader">Équipe</th>
          <th scope="col" role="columnheader">Rôle</th>
          <th scope="col" role="columnheader">Statut</th>
          <th scope="col" role="columnheader">Mot de passe</th>
          <th scope="col" role="columnheader">Actions</th>
        </tr>
      </thead>
      <tbody role="rowgroup">
        {users.map(user => <tr key={user.id} role="row">
          <th scope="row" role="rowheader">
            <div className="account-identity">
              <span className="avatar" aria-hidden="true">{user.label[0]}</span>
              <div><b>{user.label}</b><span>{user.username}</span></div>
            </div>
          </th>
          <td role="cell" data-label="Équipe"><span className={!user.team ? 'account-muted' : undefined}>{user.team || 'Sans équipe'}</span></td>
          <td role="cell" data-label="Rôle">{accountRoleLabel(user.role)}</td>
          <td role="cell" data-label="Statut">
            <span className={'account-status' + (user.active === 0 ? ' inactive' : '')}>
              <span aria-hidden="true"/>{user.active === 0 ? 'Désactivé' : 'Actif'}
            </span>
          </td>
          <td role="cell" data-label="Mot de passe">
            <span className="account-muted">{user.role === 'admin' ? 'Personnel' : user.password_available ? 'Consultable' : 'Enregistré'}</span>
          </td>
          <td role="cell" className="account-actions">
            <div className="account-action-buttons">
              {canManageAccount(actor, user)
                ? <button type="button" className="outline" aria-label={'Gérer l’accès de ' + user.label}
                    onClick={() => onManage(user)}>Gérer l’accès</button>
                : <span className="account-muted">Compte protégé</span>}
              {canRemoveAccount(actor, user) && <button type="button" className="outline danger-outline"
                aria-label={'Supprimer l’utilisateur ' + user.label} onClick={() => onRemove(user)}>Supprimer</button>}
            </div>
          </td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}
