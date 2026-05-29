import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Alert } from './Alert';

describe('Alert', () => {
  it('renders its data-component attribute', () => {
    render(<Alert>content</Alert>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Alert className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
