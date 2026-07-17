import { CharacterPanel } from './components/CharacterPanel';
import { FightView } from './components/FightView';
import { ReviewPanel } from './components/ReviewPanel';

export function App() {
  return (
    <div className="app">
      <header className="topbar">
        <h1>RPG Group Manager</h1>
        <span className="subtitle">prototype — Elara the Mage vs. Cinder Maw</span>
      </header>
      <main className="columns">
        <CharacterPanel />
        <FightView />
        <ReviewPanel />
      </main>
    </div>
  );
}
