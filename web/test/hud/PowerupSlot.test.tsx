import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PowerupSlot from '../../src/hud/PowerupSlot.js';

describe('PowerupSlot', () => {
  it('renders "—" when heldPowerup is null', () => {
    render(<PowerupSlot heldPowerup={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders powerup name in uppercase when held', () => {
    render(<PowerupSlot heldPowerup="shovel" />);
    expect(screen.getByText('SHOVEL')).toBeInTheDocument();
  });

  it('renders COMPASS in uppercase when held', () => {
    render(<PowerupSlot heldPowerup="compass" />);
    expect(screen.getByText('COMPASS')).toBeInTheDocument();
  });

  it('renders BOMB in uppercase when held', () => {
    render(<PowerupSlot heldPowerup="bomb" />);
    expect(screen.getByText('BOMB')).toBeInTheDocument();
  });
});
