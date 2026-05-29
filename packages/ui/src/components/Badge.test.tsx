import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders its data-component attribute', () => {
    render(<Badge>content</Badge>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Badge className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
