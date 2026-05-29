import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Stat } from './Stat';

describe('Stat', () => {
  it('renders its data-component attribute', () => {
    render(<Stat>content</Stat>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Stat className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
