import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TableHeader } from './TableHeader';

describe('TableHeader', () => {
  it('renders its data-component attribute', () => {
    render(<TableHeader>content</TableHeader>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<TableHeader className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
