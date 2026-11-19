import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Wordmark } from './ui/shared/Wordmark';
import { Icon } from './ui/shared/Icon';

type Props = { children: ReactNode };
type State = { failed: boolean };

/** Last resort around the whole app. The live call is also saved in this tab (sessionStorage), so a reload usually brings it back. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }
  componentDidCatch(error: unknown, info: ErrorInfo) { console.error(error, info.componentStack); }
  render() {
    if (this.state.failed) return <main className="shell-error"><div className="shell-error__card"><Wordmark size="lg"/><h1>La page n’a pas pu charger.</h1><p>Les appels déjà enregistrés sont conservés. Un appel en cours reprend au rechargement s’il a pu être gardé dans cet onglet.</p><a className="btn btn--primary" href="/">Recharger</a></div></main>;
    return this.props.children;
  }
}

/** One per view inside the shell, keyed by the view (X6): a page that crashes shows this notice while the call, kept in
 *  Desk above the shell, survives. Changing view mounts a fresh boundary. */
export class ViewBoundary extends Component<{ children: ReactNode; onCall?: () => void; title?: string }, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }
  componentDidCatch(error: unknown, info: ErrorInfo) { console.error(error, info.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="notice notice--danger view-error" role="alert"><Icon name="alert" className="notice__icon"/><div className="notice__text"><p className="notice__title">{this.props.title ?? 'Cette page n’a pas pu s’afficher.'}</p><p>{this.props.onCall ? 'L’appel en cours est conservé. Réessayez, ou revenez à l’appel guidé.' : 'L’appel en cours est conservé. Réessayez.'}</p></div>
      <button type="button" className="btn btn--secondary btn--sm" onClick={() => this.setState({ failed: false })}>Réessayer</button>
      {this.props.onCall && <button type="button" className="btn btn--primary btn--sm" onClick={this.props.onCall}>Revenir à l’appel</button>}</div>;
  }
}
