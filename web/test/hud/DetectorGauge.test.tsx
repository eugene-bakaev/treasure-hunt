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
});
