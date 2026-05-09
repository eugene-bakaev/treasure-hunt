import { useEffect, useRef } from 'react';
import type { Facing } from '@treasure-hunt/protocol';

interface UseInputCallbacks {
  onMove: (dir: Facing) => void;
  onStop: () => void;
  onDig: () => void;
}

const KEY_TO_DIR: Record<string, Facing> = {
  ArrowUp: 'N',
  w: 'N',
  W: 'N',
  ArrowDown: 'S',
  s: 'S',
  S: 'S',
  ArrowLeft: 'W',
  a: 'W',
  A: 'W',
  ArrowRight: 'E',
  d: 'E',
  D: 'E',
};

const DIG_KEYS = new Set(['j', 'J']);

export function useInput({ onMove, onStop, onDig }: UseInputCallbacks): void {
  const heldKey = useRef<string | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.repeat) return;

      if (DIG_KEYS.has(e.key)) {
        onDig();
        return;
      }

      const dir = KEY_TO_DIR[e.key];
      if (dir) {
        heldKey.current = e.key;
        onMove(dir);
      }
    }

    function handleKeyUp(e: KeyboardEvent): void {
      if (heldKey.current === e.key) {
        heldKey.current = null;
        onStop();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [onMove, onStop, onDig]);
}
