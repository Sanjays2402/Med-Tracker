import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardHeader } from './CardHeader';

describe('CardHeader', () => {
  it('renders its data-component attribute', () => {
    render(<CardHeader>content</CardHeader>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<CardHeader className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
