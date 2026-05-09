import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/App.js';

vi.mock('../src/pixi/PixiCanvas.js', () => ({
  default: () => <div data-testid="pixi-canvas" />,
}));

vi.mock('../src/net/socket.js', () => ({
  connect: () => {},
  disconnect: () => {},
  sendIntent: () => {},
}));

vi.mock('../src/state/gameStore.js', () => ({
  useGameStore: () => ({
    detector: 50,
    score: 0,
    matchEnded: false,
    winnerId: null,
    playerId: 'test-player',
  }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App routing', () => {
  it('renders Home at /', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: /treasure hunt/i })).toBeInTheDocument();
  });

  it('renders Lobby at /lobby', () => {
    renderAt('/lobby');
    expect(screen.getByRole('heading', { name: /lobby/i })).toBeInTheDocument();
  });

  it('renders Match at /match/:id', () => {
    renderAt('/match/abc-123');
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
