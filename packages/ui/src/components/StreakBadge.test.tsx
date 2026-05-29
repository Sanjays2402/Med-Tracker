import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StreakBadge } from './StreakBadge';

describe('StreakBadge', () => {
  it('renders its data-component attribute', () => {
    render(<StreakBadge>content</StreakBadge>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<StreakBadge className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
