import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Menu } from './Menu';

describe('Menu', () => {
  it('renders its data-component attribute', () => {
    render(<Menu>content</Menu>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Menu className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
