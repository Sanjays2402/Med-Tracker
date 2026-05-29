import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Kbd } from './Kbd';

describe('Kbd', () => {
  it('renders its data-component attribute', () => {
    render(<Kbd>content</Kbd>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Kbd className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
