import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormError } from './FormError';

describe('FormError', () => {
  it('renders its data-component attribute', () => {
    render(<FormError>content</FormError>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<FormError className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
