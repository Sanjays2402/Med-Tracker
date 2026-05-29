import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sheet } from './Sheet';

describe('Sheet', () => {
  it('renders its data-component attribute', () => {
    render(<Sheet>content</Sheet>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Sheet className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
