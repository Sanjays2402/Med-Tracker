import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MenuItem } from './MenuItem';

describe('MenuItem', () => {
  it('renders its data-component attribute', () => {
    render(<MenuItem>content</MenuItem>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<MenuItem className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
