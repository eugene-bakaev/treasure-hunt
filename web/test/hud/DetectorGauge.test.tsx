import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DetectorGauge from '../../src/hud/DetectorGauge';

describe('DetectorGauge', () => {
  it('renders {value}% text', () => {
    render(<DetectorGauge value={42} />);
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('the progressbar element has aria-valuenow equal to the value prop', () => {
    render(<DetectorGauge value={42} />);
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '42');
  });

  it('shows green fill when value is 0 (below 30 threshold)', () => {
    render(<DetectorGauge value={0} />);
    const progressbar = screen.getByRole('progressbar');
    const fillDiv = progressbar.firstElementChild as HTMLElement;
    expect(fillDiv.style.background).toBe('rgb(74, 222, 128)');
  });

  it('shows yellow fill when value is 50 (between 30 and 70)', () => {
    render(<DetectorGauge value={50} />);
    const progressbar = screen.getByRole('progressbar');
    const fillDiv = progressbar.firstElementChild as HTMLElement;
    expect(fillDiv.style.background).toBe('rgb(255, 215, 0)');
  });

  it('shows orange fill when value is 90 (above 70 threshold)', () => {
    render(<DetectorGauge value={90} />);
    const progressbar = screen.getByRole('progressbar');
    const fillDiv = progressbar.firstElementChild as HTMLElement;
    expect(fillDiv.style.background).toBe('rgb(255, 107, 53)');
  });
});
