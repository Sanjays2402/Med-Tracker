import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Banner } from './Banner';

describe('Banner', () => {
  it('renders its data-component attribute', () => {
    render(<Banner>content</Banner>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Banner className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
