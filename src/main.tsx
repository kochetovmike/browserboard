import { render } from 'preact';
import { App } from './ui/App';
import './ui/styles.css';

const root = document.getElementById('app');
if (root) {
  root.textContent = ''; // drop the static "loading / opened from disk" fallback
  render(<App />, root);
}
