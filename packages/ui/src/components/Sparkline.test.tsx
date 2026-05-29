import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sparkline } from './Sparkline';

describe('Sparkline', () => {
  it('renders its data-component attribute', () => {
    render(<Sparkline>content</Sparkline>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Sparkline className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
