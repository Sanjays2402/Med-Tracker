import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders its data-component attribute', () => {
    render(<EmptyState>content</EmptyState>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<EmptyState className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
