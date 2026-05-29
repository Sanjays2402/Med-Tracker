import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MissedDoseBanner } from './MissedDoseBanner';

describe('MissedDoseBanner', () => {
  it('renders its data-component attribute', () => {
    render(<MissedDoseBanner>content</MissedDoseBanner>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<MissedDoseBanner className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
