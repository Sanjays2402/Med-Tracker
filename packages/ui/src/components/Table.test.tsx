import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Table } from './Table';

describe('Table', () => {
  it('renders its data-component attribute', () => {
    render(<Table>content</Table>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Table className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
