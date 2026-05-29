import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tooltip } from './Tooltip';

describe('Tooltip', () => {
  it('renders its data-component attribute', () => {
    render(<Tooltip>content</Tooltip>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Tooltip className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
