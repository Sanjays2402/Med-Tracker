import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Chip } from './Chip';

describe('Chip', () => {
  it('renders its data-component attribute', () => {
    render(<Chip>content</Chip>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Chip className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
