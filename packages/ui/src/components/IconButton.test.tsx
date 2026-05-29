import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IconButton } from './IconButton';

describe('IconButton', () => {
  it('renders its data-component attribute', () => {
    render(<IconButton>content</IconButton>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<IconButton className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
