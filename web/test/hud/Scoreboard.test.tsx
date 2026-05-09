import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Scoreboard from '../../src/hud/Scoreboard';

describe('Scoreboard', () => {
  it('renders nickname and score', () => {
    render(<Scoreboard nickname="Alice" score={100} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('shows "You win!" when matchEnded={true} and isWinner={true}', () => {
    render(<Scoreboard nickname="Alice" score={100} matchEnded={true} isWinner={true} />);
    expect(screen.getByText('You win!')).toBeInTheDocument();
  });

  it('shows "Game over" when matchEnded={true} and isWinner={false}', () => {
    render(<Scoreboard nickname="Alice" score={100} matchEnded={true} isWinner={false} />);
    expect(screen.getByText('Game over')).toBeInTheDocument();
  });

  it('shows no result text when match not ended', () => {
    render(<Scoreboard nickname="Alice" score={10} />);
    expect(screen.queryByText('You win!')).toBeNull();
    expect(screen.queryByText('Game over')).toBeNull();
  });
});
