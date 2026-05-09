import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import type { CellType } from '@treasure-hunt/protocol';
import { MapRenderer } from './renderers/MapRenderer.js';
import { PlayerRenderer } from './renderers/PlayerRenderer.js';
import { useGameStore } from '../state/gameStore.js';

const CELL_SIZE = 16;

export default function PixiCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const mapRendRef = useRef<MapRenderer | null>(null);
  const playerRendRef = useRef<PlayerRenderer | null>(null);
  const cellsRef = useRef<typeof cells | null>(null);

  const mapWidth = useGameStore((s) => s.mapWidth);
  const mapHeight = useGameStore((s) => s.mapHeight);
  const cells = useGameStore((s) => s.cells);

  // Keep cells ref in sync
  cellsRef.current = cells;

  // Bootstrap Pixi once the container is mounted
  useEffect(() => {
    if (!containerRef.current) return;

    const app = new Application();
    appRef.current = app;
    let active = true;

    app
      .init({
        width: CELL_SIZE * 40,
        height: CELL_SIZE * 40,
        background: 0x222222,
      })
      .then(() => {
        if (!active) {
          // Cleanup fired before init resolved — destroy now that it's safe
          app.destroy(true);
          return;
        }
        containerRef.current?.appendChild(app.canvas);
        mapRendRef.current = new MapRenderer(app);
        playerRendRef.current = new PlayerRenderer(app);
      });

    return () => {
      active = false;
      mapRendRef.current = null;
      playerRendRef.current = null;
      // Only destroy if init already resolved (renderer present); otherwise .then() handles it
      if (app.renderer) {
        app.destroy(true);
      }
      appRef.current = null;
    };
  }, []);

  // Re-init the map when the store has a real map
  useEffect(() => {
    if (!mapRendRef.current || mapWidth === 0) return;
    mapRendRef.current.initMap(mapWidth, mapHeight, cellsRef.current!);
  }, [mapWidth, mapHeight]);

  // Subscribe to players at high frequency using a store subscriber
  useEffect(() => {
    const unsub = useGameStore.subscribe((state) => {
      playerRendRef.current?.update(state.players);
      // Update only changed cells
      const changed = new Map<string, CellType>();
      for (const [k, v] of state.cells) {
        changed.set(k, v);
      }
      mapRendRef.current?.updateCells(changed);
    });
    return unsub;
  }, []);

  return <div ref={containerRef} style={{ lineHeight: 0 }} />;
}
