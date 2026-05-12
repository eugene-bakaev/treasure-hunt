import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import Home from '../../src/screens/Home.js';
import { GetLeaderboardDocument } from '../../src/gql/generated/graphql.js';

vi.mock('../../src/net/lobby.js', () => ({
  createMatch: vi.fn().mockResolvedValue({ matchId: 'match-123', joinCode: 'ABC123' }),
  fetchPublicMatches: vi.fn().mockResolvedValue([]),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

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

describe('Home screen', () => {
  it('renders Public and Private match buttons', () => {
    render(
      <MockedProvider mocks={[leaderboardMock]}>
        <MemoryRouter>
          <Home />
        </MemoryRouter>
      </MockedProvider>
    );
    expect(screen.getByRole('button', { name: /create public match/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create private match/i })).toBeInTheDocument();
  });

  it('navigates to /match/:id with joinCode state on click', async () => {
    render(
      <MockedProvider mocks={[leaderboardMock]}>
        <MemoryRouter>
          <Home />
        </MemoryRouter>
      </MockedProvider>
    );

    const input = screen.getByPlaceholderText(/enter nickname/i);
    fireEvent.change(input, { target: { value: 'TestPlayer' } });

    fireEvent.click(screen.getByRole('button', { name: /create public match/i }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        '/match/match-123',
        { state: { joinCode: 'ABC123' } },
      );
    });
  });
});

