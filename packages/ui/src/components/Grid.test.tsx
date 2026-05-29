import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Grid } from './Grid';

describe('Grid', () => {
  it('renders its data-component attribute', () => {
    render(<Grid>content</Grid>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Grid className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
