import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Box } from './Box';

describe('Box', () => {
  it('renders its data-component attribute', () => {
    render(<Box>content</Box>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Box className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
