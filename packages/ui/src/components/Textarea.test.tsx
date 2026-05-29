import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Textarea } from './Textarea';

describe('Textarea', () => {
  it('renders its data-component attribute', () => {
    render(<Textarea>content</Textarea>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Textarea className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
