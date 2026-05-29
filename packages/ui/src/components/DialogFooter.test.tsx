import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DialogFooter } from './DialogFooter';

describe('DialogFooter', () => {
  it('renders its data-component attribute', () => {
    render(<DialogFooter>content</DialogFooter>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<DialogFooter className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
