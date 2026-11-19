import { accountRoleLabel, canManageAccount, canRemoveAccount } from '@touche/domain';
import { Icon } from './shared/Icon';

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
  return <div className="data-table admin-accounts">
    <table aria-label="Comptes et autorisations" role="table">
      <thead role="rowgroup">
        <tr role="row">
          <th scope="col" role="columnheader">Compte</th>
          <th scope="col" role="columnheader">Équipe</th>
          <th scope="col" role="columnheader">Rôle</th>
          <th scope="col" role="columnheader">Statut</th>
          <th scope="col" role="columnheader">Mot de passe</th>
          <th scope="col" role="columnheader" className="data-table__action">Actions</th>
        </tr>
      </thead>
      <tbody role="rowgroup">
        {users.map(user => <tr key={user.id} role="row">
          <th scope="row" role="rowheader">
            <div className="admin-identity">
              <span className="avatar" aria-hidden="true">{user.label[0]}</span>
              <div><b>{user.label}</b><small>{user.username}</small></div>
            </div>
          </th>
          <td role="cell" data-label="Équipe"><span className={!user.team ? 'muted' : undefined}>{user.team || 'Sans équipe'}</span></td>
          <td role="cell" data-label="Rôle">{accountRoleLabel(user.role)}</td>
          <td role="cell" data-label="Statut">
            {user.active === 0
              ? <span className="tag tag--danger"><Icon name="lock"/>Désactivé</span>
              : <span className="tag tag--success"><Icon name="check"/>Actif</span>}
          </td>
          <td role="cell" data-label="Mot de passe">
            <span className="muted">{user.role === 'admin' ? 'Personnel' : user.password_available ? 'Consultable' : 'Enregistré'}</span>
          </td>
          <td role="cell" className="data-table__action">
            <div className="admin-row-actions">
              {canManageAccount(actor, user)
                ? <button type="button" className="btn btn--secondary btn--sm" aria-label={'Gérer l’accès de ' + user.label}
                    onClick={() => onManage(user)}>Gérer l’accès…</button>
                : <span className="muted"><Icon name="lock" size={16}/> Compte protégé</span>}
              {canRemoveAccount(actor, user) && <button type="button" className="btn btn--secondary btn--sm admin-remove"
                aria-label={'Supprimer l’utilisateur ' + user.label} onClick={() => onRemove(user)}>Supprimer…</button>}
            </div>
          </td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}
