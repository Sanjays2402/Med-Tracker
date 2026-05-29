import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NavItem } from './NavItem';

describe('NavItem', () => {
  it('renders its data-component attribute', () => {
    render(<NavItem>content</NavItem>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<NavItem className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
