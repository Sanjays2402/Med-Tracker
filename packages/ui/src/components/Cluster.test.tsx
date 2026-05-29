import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Cluster } from './Cluster';

describe('Cluster', () => {
  it('renders its data-component attribute', () => {
    render(<Cluster>content</Cluster>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Cluster className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
