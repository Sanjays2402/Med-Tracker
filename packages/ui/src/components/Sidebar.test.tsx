import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from './Sidebar';

describe('Sidebar', () => {
  it('renders its data-component attribute', () => {
    render(<Sidebar>content</Sidebar>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Sidebar className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
