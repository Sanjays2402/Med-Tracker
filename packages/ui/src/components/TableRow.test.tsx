import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TableRow } from './TableRow';

describe('TableRow', () => {
  it('renders its data-component attribute', () => {
    render(<TableRow>content</TableRow>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<TableRow className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
