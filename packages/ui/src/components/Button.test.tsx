import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders its data-component attribute', () => {
    render(<Button>content</Button>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Button className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
