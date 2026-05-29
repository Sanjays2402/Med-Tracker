import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SchedulePreview } from './SchedulePreview';

describe('SchedulePreview', () => {
  it('renders its data-component attribute', () => {
    render(<SchedulePreview>content</SchedulePreview>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<SchedulePreview className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
