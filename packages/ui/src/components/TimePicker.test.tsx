import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimePicker } from './TimePicker';

describe('TimePicker', () => {
  it('renders its data-component attribute', () => {
    render(<TimePicker>content</TimePicker>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<TimePicker className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
