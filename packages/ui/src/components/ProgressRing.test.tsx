import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressRing } from './ProgressRing';

describe('ProgressRing', () => {
  it('renders its data-component attribute', () => {
    render(<ProgressRing>content</ProgressRing>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<ProgressRing className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
