import { getGame } from '../games/registry';
import { Home } from './Home';
import { Play } from './Play';
import { route } from './router';

export function App() {
  const r = route.value;
  if (r.name === 'play') {
    const def = getGame(r.gameId);
    // Key on the full route so a new hash always starts a fresh session.
    if (def) return <Play key={JSON.stringify(r)} def={def} route={r} />;
  }
  return <Home />;
}
