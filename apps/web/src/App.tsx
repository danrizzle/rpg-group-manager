import { useEffect } from 'react';
import { BasePanel } from './components/BasePanel';
import { CharacterPanel } from './components/CharacterPanel';
import { FightView } from './components/FightView';
import { ReviewPanel } from './components/ReviewPanel';
import { WorldMapPanel } from './components/WorldMapPanel';
import { AwaySummaryModal } from './components/AwaySummaryModal';
import { useStore } from './store';

export function App() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);

  // The world clock: reconcile elapsed real time every 250ms (self-correcting —
  // tickWorld derives its own delta, so a throttled tab catches up). Also flush
  // on hide/close so the next offline delta baseline is correct.
  useEffect(() => {
    // Reconcile offline time once, before the live tick can drain the queue.
    useStore.getState().catchUp();
    const id = setInterval(() => useStore.getState().tickWorld(), 250);
    const flush = () => useStore.getState().tickWorld();
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <h1>RPG Group Manager</h1>
        <span className="subtitle">prototype — Elara the Mage</span>
        <div className="segmented topbar-nav">
          <button className={`btn btn-small ${view === 'map' ? 'btn-active' : ''}`} onClick={() => setView('map')}>
            World
          </button>
          <button className={`btn btn-small ${view === 'base' ? 'btn-active' : ''}`} onClick={() => setView('base')}>
            Base
          </button>
          <button className={`btn btn-small ${view === 'combat' ? 'btn-active' : ''}`} onClick={() => setView('combat')}>
            Combat
          </button>
        </div>
      </header>
      {view === 'map' ? (
        <main className="columns columns-map">
          <CharacterPanel />
          <WorldMapPanel />
        </main>
      ) : view === 'base' ? (
        <main className="columns columns-map">
          <CharacterPanel />
          <BasePanel />
        </main>
      ) : (
        <main className="columns">
          <CharacterPanel />
          <FightView />
          <ReviewPanel />
        </main>
      )}
      <AwaySummaryModal />
    </div>
  );
}
