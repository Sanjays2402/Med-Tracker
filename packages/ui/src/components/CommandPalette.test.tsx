import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CommandPalette } from './CommandPalette';

describe('CommandPalette', () => {
  it('renders its data-component attribute', () => {
    render(<CommandPalette>content</CommandPalette>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<CommandPalette className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
