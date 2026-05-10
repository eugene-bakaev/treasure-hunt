import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BuffBar from '../../src/hud/BuffBar';

describe('BuffBar', () => {
  it('renders nothing when ticks is 0', () => {
    const { container } = render(<BuffBar fasterShovelTicksRemaining={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when ticks is negative', () => {
    const { container } = render(<BuffBar fasterShovelTicksRemaining={-5} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders label and bar when ticks > 0', () => {
    // 450 ticks = 15 seconds
    render(<BuffBar fasterShovelTicksRemaining={450} />);
    expect(screen.getByText(/FASTER SHOVEL 15s/i)).toBeInTheDocument();
    
    const progressbar = screen.getByRole('progressbar');
    const fillDiv = progressbar.firstElementChild as HTMLElement;
    expect(fillDiv.style.width).toBe('100%');
  });

  it('renders correct seconds and percentage for partial ticks', () => {
    // 225 ticks = 7.5 seconds -> ceil is 8s
    // 225 / 450 = 50%
    render(<BuffBar fasterShovelTicksRemaining={225} />);
    expect(screen.getByText(/FASTER SHOVEL 8s/i)).toBeInTheDocument();
    
    const progressbar = screen.getByRole('progressbar');
    const fillDiv = progressbar.firstElementChild as HTMLElement;
    expect(fillDiv.style.width).toBe('50%');
  });

  it('handles small amount of ticks correctly', () => {
    // 1 tick = 0.033s -> ceil is 1s
    // 1 / 450 approx 0.222%
    render(<BuffBar fasterShovelTicksRemaining={1} />);
    expect(screen.getByText(/FASTER SHOVEL 1s/i)).toBeInTheDocument();
    
    const progressbar = screen.getByRole('progressbar');
    const fillDiv = progressbar.firstElementChild as HTMLElement;
    expect(fillDiv.style.width).toBeDefined();
    // (1/450)*100 = 0.2222222222222222
    // We can check if it's close or exactly that if we use toLocaleString or similar but simple match should work
    expect(fillDiv.style.width).toMatch(/^0\.22/);
  });
});
