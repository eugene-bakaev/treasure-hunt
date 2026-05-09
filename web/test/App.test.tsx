import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import App from '../src/App.js';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
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

  it('renders Match at /match/:id', () => {
    renderAt('/match/abc-123');
    expect(screen.getByText(/match abc-123/i)).toBeInTheDocument();
  });
});
