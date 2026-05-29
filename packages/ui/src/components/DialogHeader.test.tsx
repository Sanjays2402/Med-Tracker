import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DialogHeader } from './DialogHeader';

describe('DialogHeader', () => {
  it('renders its data-component attribute', () => {
    render(<DialogHeader>content</DialogHeader>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<DialogHeader className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
