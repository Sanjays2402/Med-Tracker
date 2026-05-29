import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrintHeader } from './PrintHeader';

describe('PrintHeader', () => {
  it('renders its data-component attribute', () => {
    render(<PrintHeader>content</PrintHeader>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<PrintHeader className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
