import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SidebarItem } from './SidebarItem';

describe('SidebarItem', () => {
  it('renders its data-component attribute', () => {
    render(<SidebarItem>content</SidebarItem>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<SidebarItem className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
