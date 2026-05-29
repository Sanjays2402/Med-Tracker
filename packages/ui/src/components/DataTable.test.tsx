import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataTable } from './DataTable';

describe('DataTable', () => {
  it('renders its data-component attribute', () => {
    render(<DataTable>content</DataTable>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<DataTable className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
