import { createRoot } from 'react-dom/client';
import './styles.css';
import { ErrorBoundary } from './ErrorBoundary';
import Desk from './ui/App';

createRoot(document.getElementById('root')!).render(<ErrorBoundary><Desk /></ErrorBoundary>);
