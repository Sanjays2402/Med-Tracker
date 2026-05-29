import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeToggle } from './ThemeToggle';

describe('ThemeToggle', () => {
  it('renders its data-component attribute', () => {
    render(<ThemeToggle>content</ThemeToggle>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<ThemeToggle className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
