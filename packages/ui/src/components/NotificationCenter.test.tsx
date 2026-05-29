import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationCenter } from './NotificationCenter';

describe('NotificationCenter', () => {
  it('renders its data-component attribute', () => {
    render(<NotificationCenter>content</NotificationCenter>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<NotificationCenter className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
