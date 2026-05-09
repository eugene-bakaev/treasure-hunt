import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Home from '../../src/screens/Home.js';

vi.mock('../../src/net/lobby.js', () => ({
  createMatch: vi.fn().mockResolvedValue({ matchId: 'match-123', joinCode: 'ABC123' }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('Home screen', () => {
  it('renders Create Match button', () => {
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /create match/i })).toBeInTheDocument();
  });

  it('navigates to /match/:id with joinCode state on click', async () => {
    render(<MemoryRouter><Home /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /create match/i }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        '/match/match-123',
        { state: { joinCode: 'ABC123' } },
      );
    });
  });
});
