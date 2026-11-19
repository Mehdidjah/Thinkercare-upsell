import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { ErrorBoundary } from './ErrorBoundary';
import { NotificationsProvider } from './ui/shell/Notifications';
import { ConfirmProvider } from './ui/shared/Confirm';
import Desk from './ui/App';

createRoot(document.getElementById('root')!).render(<ErrorBoundary><NotificationsProvider><ConfirmProvider><Desk /></ConfirmProvider></NotificationsProvider></ErrorBoundary>);
