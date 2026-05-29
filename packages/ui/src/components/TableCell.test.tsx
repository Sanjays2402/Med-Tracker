import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TableCell } from './TableCell';

describe('TableCell', () => {
  it('renders its data-component attribute', () => {
    render(<TableCell>content</TableCell>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<TableCell className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
