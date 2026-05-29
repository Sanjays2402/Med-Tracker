import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
  it('renders its data-component attribute', () => {
    render(<Skeleton>content</Skeleton>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Skeleton className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
