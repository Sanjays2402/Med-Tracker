import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RefillCard } from './RefillCard';

describe('RefillCard', () => {
  it('renders its data-component attribute', () => {
    render(<RefillCard>content</RefillCard>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<RefillCard className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
