import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Join from '../../src/screens/Join.js';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../src/net/lobby.js', () => ({
  joinMatch: vi.fn().mockResolvedValue({ matchId: 'match-456' }),
}));

beforeEach(() => mockNavigate.mockClear());

function renderJoin(joinCode: string) {
  return render(
    <MemoryRouter initialEntries={[`/join/${joinCode}`]}>
      <Routes>
        <Route path="/join/:joinCode" element={<Join />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Join screen', () => {
  it('shows Joining… while resolving', () => {
    renderJoin('ABC123');
    expect(screen.getByText(/joining/i)).toBeInTheDocument();
  });

  it('navigates to /match/:id after resolving', async () => {
    renderJoin('ABC123');
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/match/match-456');
    });
  });

  it('shows error for invalid join code', async () => {
    const { joinMatch } = await import('../../src/net/lobby.js');
    vi.mocked(joinMatch).mockRejectedValueOnce(new Error('Invalid'));
    renderJoin('XXXXXX');
    await waitFor(() => {
      expect(screen.getByText(/invalid/i)).toBeInTheDocument();
    });
  });
});
