import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInput } from '../../src/hooks/useInput.js';

describe('useInput', () => {
  it('calls onMove when a movement key is pressed', () => {
    const onMove = vi.fn();
    const onStop = vi.fn();
    const onDig = vi.fn();

    renderHook(() => useInput({ onMove, onStop, onDig }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });

    expect(onMove).toHaveBeenCalledWith('E');
  });

  it('calls onStop when the key is released', () => {
    const onMove = vi.fn();
    const onStop = vi.fn();
    const onDig = vi.fn();

    renderHook(() => useInput({ onMove, onStop, onDig }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd', bubbles: true }));
    });

    expect(onStop).toHaveBeenCalled();
  });

  it('calls onDig when J is pressed', () => {
    const onMove = vi.fn();
    const onStop = vi.fn();
    const onDig = vi.fn();

    renderHook(() => useInput({ onMove, onStop, onDig }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
    });

    expect(onDig).toHaveBeenCalled();
  });
});
