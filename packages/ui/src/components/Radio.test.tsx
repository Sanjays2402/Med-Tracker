import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Radio } from './Radio';

describe('Radio', () => {
  it('renders its data-component attribute', () => {
    render(<Radio>content</Radio>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Radio className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
