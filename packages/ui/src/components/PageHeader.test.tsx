import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders its data-component attribute', () => {
    render(<PageHeader>content</PageHeader>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<PageHeader className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
