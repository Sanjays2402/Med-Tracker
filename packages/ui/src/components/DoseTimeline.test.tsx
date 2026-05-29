import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DoseTimeline } from './DoseTimeline';

describe('DoseTimeline', () => {
  it('renders its data-component attribute', () => {
    render(<DoseTimeline>content</DoseTimeline>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<DoseTimeline className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
