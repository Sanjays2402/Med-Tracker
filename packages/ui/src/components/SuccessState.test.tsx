import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SuccessState } from './SuccessState';

describe('SuccessState', () => {
  it('renders its data-component attribute', () => {
    render(<SuccessState>content</SuccessState>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<SuccessState className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
