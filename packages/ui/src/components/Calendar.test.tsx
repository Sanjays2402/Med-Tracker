import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Calendar } from './Calendar';

describe('Calendar', () => {
  it('renders its data-component attribute', () => {
    render(<Calendar>content</Calendar>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Calendar className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
