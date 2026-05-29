import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScheduleForm } from './ScheduleForm';

describe('ScheduleForm', () => {
  it('renders its data-component attribute', () => {
    render(<ScheduleForm>content</ScheduleForm>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<ScheduleForm className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
