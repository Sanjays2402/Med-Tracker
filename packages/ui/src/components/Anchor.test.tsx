import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Anchor } from './Anchor';

describe('Anchor', () => {
  it('renders its data-component attribute', () => {
    render(<Anchor>content</Anchor>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Anchor className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
