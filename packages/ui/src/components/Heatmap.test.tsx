import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Heatmap } from './Heatmap';

describe('Heatmap', () => {
  it('renders its data-component attribute', () => {
    render(<Heatmap>content</Heatmap>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Heatmap className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
