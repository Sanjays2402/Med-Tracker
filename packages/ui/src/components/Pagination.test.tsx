import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('renders its data-component attribute', () => {
    render(<Pagination>content</Pagination>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Pagination className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
