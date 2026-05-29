import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  it('renders its data-component attribute', () => {
    render(<ErrorState>content</ErrorState>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<ErrorState className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
