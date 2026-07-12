import { createRoot } from 'react-dom/client';
import { OptionsPage } from './PilotOptions';

if (new URLSearchParams(window.location.search).get('embed') === '1') {
  document.documentElement.classList.add('embed');
  document.body.classList.add('embed');
}

createRoot(document.getElementById('root')!).render(<OptionsPage />);
