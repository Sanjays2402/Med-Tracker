import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Code } from './Code';

describe('Code', () => {
  it('renders its data-component attribute', () => {
    render(<Code>content</Code>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Code className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
