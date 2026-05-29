import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UpcomingDoseBanner } from './UpcomingDoseBanner';

describe('UpcomingDoseBanner', () => {
  it('renders its data-component attribute', () => {
    render(<UpcomingDoseBanner>content</UpcomingDoseBanner>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<UpcomingDoseBanner className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
