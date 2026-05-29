import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from './Input';

describe('Input', () => {
  it('renders its data-component attribute', () => {
    render(<Input>content</Input>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Input className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
