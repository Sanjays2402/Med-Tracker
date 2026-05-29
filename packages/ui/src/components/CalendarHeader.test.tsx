import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CalendarHeader } from './CalendarHeader';

describe('CalendarHeader', () => {
  it('renders its data-component attribute', () => {
    render(<CalendarHeader>content</CalendarHeader>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<CalendarHeader className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
