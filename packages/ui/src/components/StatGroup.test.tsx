import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatGroup } from './StatGroup';

describe('StatGroup', () => {
  it('renders its data-component attribute', () => {
    render(<StatGroup>content</StatGroup>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<StatGroup className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
