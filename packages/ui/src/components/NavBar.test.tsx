import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NavBar } from './NavBar';

describe('NavBar', () => {
  it('renders its data-component attribute', () => {
    render(<NavBar>content</NavBar>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<NavBar className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
