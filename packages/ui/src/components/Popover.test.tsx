import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Popover } from './Popover';

describe('Popover', () => {
  it('renders its data-component attribute', () => {
    render(<Popover>content</Popover>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Popover className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
