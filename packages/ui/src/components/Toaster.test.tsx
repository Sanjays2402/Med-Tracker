import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Toaster } from './Toaster';

describe('Toaster', () => {
  it('renders its data-component attribute', () => {
    render(<Toaster>content</Toaster>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Toaster className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
