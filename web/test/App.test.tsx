import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import App from '../src/App.js';
import { GetLeaderboardDocument } from '../src/gql/generated/graphql.js';

vi.mock('../src/pixi/PixiCanvas.js', () => ({
  default: () => <div data-testid="pixi-canvas" />,
}));

vi.mock('../src/net/socket.js', () => ({
  connect: (_matchId: string) => {},
  disconnect: () => {},
  sendIntent: () => {},
  getNickname: () => 'TestPlayer',
  setNickname: (_name: string) => {},
}));

vi.mock('../src/net/lobby.js', () => ({
  createMatch: vi.fn().mockResolvedValue({ matchId: 'match-123', joinCode: 'ABC123' }),
  joinMatch: vi.fn().mockResolvedValue({ matchId: 'match-456' }),
}));

vi.mock('../src/state/gameStore.js', () => ({
  useGameStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ detector: 50, score: 0, matchEnded: false, winnerId: null, playerId: null }),
}));

const leaderboardMock = {
  request: {
    query: GetLeaderboardDocument,
    variables: { limit: 10 },
  },
  result: {
    data: {
      leaderboard: [],
    },
  },
};

function renderAt(path: string) {
  return render(
    <MockedProvider mocks={[leaderboardMock]}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </MockedProvider>,
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

  it('renders Join at /join/:joinCode', () => {
    renderAt('/join/ABC123');
    expect(screen.getByText(/joining/i)).toBeInTheDocument();
  });

  it('renders Match waiting overlay at /match/:id (no playerId)', () => {
    renderAt('/match/abc-123');
    expect(screen.getByText(/waiting for opponent/i)).toBeInTheDocument();
  });
});
