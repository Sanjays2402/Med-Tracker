import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Switch } from './Switch';

describe('Switch', () => {
  it('renders its data-component attribute', () => {
    render(<Switch>content</Switch>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Switch className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
