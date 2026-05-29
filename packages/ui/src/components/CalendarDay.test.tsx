import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CalendarDay } from './CalendarDay';

describe('CalendarDay', () => {
  it('renders its data-component attribute', () => {
    render(<CalendarDay>content</CalendarDay>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<CalendarDay className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
