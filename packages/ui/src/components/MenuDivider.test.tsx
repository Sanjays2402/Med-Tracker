import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MenuDivider } from './MenuDivider';

describe('MenuDivider', () => {
  it('renders its data-component attribute', () => {
    render(<MenuDivider>content</MenuDivider>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<MenuDivider className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
