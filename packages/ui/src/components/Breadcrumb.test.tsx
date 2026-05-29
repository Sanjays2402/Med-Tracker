import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Breadcrumb } from './Breadcrumb';

describe('Breadcrumb', () => {
  it('renders its data-component attribute', () => {
    render(<Breadcrumb>content</Breadcrumb>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Breadcrumb className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
