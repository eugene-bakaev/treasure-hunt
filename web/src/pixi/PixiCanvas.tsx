import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import { MapRenderer } from './renderers/MapRenderer.js';
import { PlayerRenderer } from './renderers/PlayerRenderer.js';
import { useGameStore } from '../state/gameStore.js';

const CELL_SIZE = 16;

export default function PixiCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const mapRendRef = useRef<MapRenderer | null>(null);
  const playerRendRef = useRef<PlayerRenderer | null>(null);
  const initedRef = useRef(false);

  const { mapWidth, mapHeight, cells } = useGameStore((s) => ({
    mapWidth: s.mapWidth,
    mapHeight: s.mapHeight,
    cells: s.cells,
  }));

  // Bootstrap Pixi once the container is mounted
  useEffect(() => {
    if (!containerRef.current) return;
    if (initedRef.current) return;
    initedRef.current = true;

    const app = new Application();
    appRef.current = app;

    app
      .init({
        width: CELL_SIZE * 40,
        height: CELL_SIZE * 40,
        background: 0x222222,
      })
      .then(() => {
        containerRef.current?.appendChild(app.canvas);
        mapRendRef.current = new MapRenderer(app);
        playerRendRef.current = new PlayerRenderer(app);
      });

    return () => {
      initedRef.current = false;
      app.destroy(true);
      appRef.current = null;
    };
  }, []);

  // Re-init the map when the store has a real map
  useEffect(() => {
    if (!mapRendRef.current || mapWidth === 0) return;
    mapRendRef.current.initMap(mapWidth, mapHeight, cells);
  }, [mapWidth, mapHeight, cells]);

  // Subscribe to players at high frequency using a store subscriber
  useEffect(() => {
    const unsub = useGameStore.subscribe((state) => {
      playerRendRef.current?.update(state.players);
      // Update only changed cells
      const changed = new Map<string, import('@treasure-hunt/protocol').CellType>();
      for (const [k, v] of state.cells) {
        changed.set(k, v);
      }
      mapRendRef.current?.updateCells(changed);
    });
    return unsub;
  }, []);

  return <div ref={containerRef} style={{ lineHeight: 0 }} />;
}
