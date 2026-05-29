import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Stack } from './Stack';

describe('Stack', () => {
  it('renders its data-component attribute', () => {
    render(<Stack>content</Stack>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Stack className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
