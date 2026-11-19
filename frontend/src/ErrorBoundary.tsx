import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Wordmark } from './ui/shared/Wordmark';

type Props = { children: ReactNode };
type State = { failed: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }
  componentDidCatch(error: unknown, info: ErrorInfo) { console.error(error, info.componentStack); }
  render() {
    if (this.state.failed) return <main className="shell-error"><div className="shell-error__card"><Wordmark size="lg"/><h1>La page n’a pas pu charger.</h1><p>Vos données déjà enregistrées sont conservées.</p><a className="btn btn--primary" href="/">Réessayer</a></div></main>;
    return this.props.children;
  }
}
