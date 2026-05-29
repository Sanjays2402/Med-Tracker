import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrendChart } from './TrendChart';

describe('TrendChart', () => {
  it('renders its data-component attribute', () => {
    render(<TrendChart>content</TrendChart>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<TrendChart className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
