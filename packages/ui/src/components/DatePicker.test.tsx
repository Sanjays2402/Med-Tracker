import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DatePicker } from './DatePicker';

describe('DatePicker', () => {
  it('renders its data-component attribute', () => {
    render(<DatePicker>content</DatePicker>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<DatePicker className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
