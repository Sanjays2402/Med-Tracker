import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('renders its data-component attribute', () => {
    render(<Dialog>content</Dialog>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Dialog className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
