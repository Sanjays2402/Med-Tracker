import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppShell } from './AppShell';

describe('AppShell', () => {
  it('renders its data-component attribute', () => {
    render(<AppShell>content</AppShell>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<AppShell className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
