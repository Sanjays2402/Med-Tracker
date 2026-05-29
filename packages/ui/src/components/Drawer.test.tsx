import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Drawer } from './Drawer';

describe('Drawer', () => {
  it('renders its data-component attribute', () => {
    render(<Drawer>content</Drawer>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Drawer className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
