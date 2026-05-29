import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationItem } from './NotificationItem';

describe('NotificationItem', () => {
  it('renders its data-component attribute', () => {
    render(<NotificationItem>content</NotificationItem>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<NotificationItem className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
