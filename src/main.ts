// EMBERBOUND EXPEDITION — entry point. Fonts and styles are bundled (works fully offline).
import './styles/tokens.css';
import './styles/base.css';
import './styles/hud.css';
import './styles/screens.css';
import './styles/camp.css';
import './styles/storybook.css';
import './styles/phone.css';
import { App } from './ui/app.ts';

function boot(): void {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app missing');
  const app = new App(root);
  app.start();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
