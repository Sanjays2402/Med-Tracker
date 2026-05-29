import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('renders its data-component attribute', () => {
    render(<Avatar>content</Avatar>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Avatar className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
