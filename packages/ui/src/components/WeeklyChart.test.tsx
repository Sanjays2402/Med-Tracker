import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WeeklyChart } from './WeeklyChart';

describe('WeeklyChart', () => {
  it('renders its data-component attribute', () => {
    render(<WeeklyChart>content</WeeklyChart>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<WeeklyChart className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
