import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('renders its data-component attribute', () => {
    render(<Spinner>content</Spinner>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Spinner className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
