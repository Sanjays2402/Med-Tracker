import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Link } from './Link';

describe('Link', () => {
  it('renders its data-component attribute', () => {
    render(<Link>content</Link>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Link className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
