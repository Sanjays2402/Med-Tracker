import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuietHoursToggle } from './QuietHoursToggle';

describe('QuietHoursToggle', () => {
  it('renders its data-component attribute', () => {
    render(<QuietHoursToggle>content</QuietHoursToggle>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<QuietHoursToggle className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
