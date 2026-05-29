import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardFooter } from './CardFooter';

describe('CardFooter', () => {
  it('renders its data-component attribute', () => {
    render(<CardFooter>content</CardFooter>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<CardFooter className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
