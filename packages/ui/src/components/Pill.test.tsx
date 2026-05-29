import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Pill } from './Pill';

describe('Pill', () => {
  it('renders its data-component attribute', () => {
    render(<Pill>content</Pill>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Pill className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
