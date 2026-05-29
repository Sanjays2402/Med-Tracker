import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Field } from './Field';

describe('Field', () => {
  it('renders its data-component attribute', () => {
    render(<Field>content</Field>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Field className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
