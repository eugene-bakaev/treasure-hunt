import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { Leaderboard } from '../../src/components/Leaderboard.js';
import { GetLeaderboardDocument } from '../../src/gql/generated/graphql.js';

const mocks = [
  {
    request: {
      query: GetLeaderboardDocument,
      variables: { limit: 10 },
    },
    result: {
      data: {
        leaderboard: [
          {
            __typename: 'PlayerStats',
            nickname: 'Player1',
            totalScore: 100,
            matchesWon: 5,
            winRate: 0.5,
          },
        ],
      },
    },
  },
];

describe('Leaderboard', () => {
  it('renders loading state initially', () => {
    render(
      <MockedProvider mocks={[]}>
        <Leaderboard />
      </MockedProvider>
    );
    expect(screen.getByText(/loading leaderboard/i)).toBeDefined();
  });

  it('renders data when loaded', async () => {
    render(
      <MockedProvider mocks={mocks}>
        <Leaderboard />
      </MockedProvider>
    );
    
    const player = await screen.findByText('Player1');
    expect(player).toBeDefined();
    expect(screen.getByText('100')).toBeDefined();
    expect(screen.getByText('50.0%')).toBeDefined();
  });
});
