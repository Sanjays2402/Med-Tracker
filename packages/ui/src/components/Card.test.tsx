import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from './Card';

describe('Card', () => {
  it('renders its data-component attribute', () => {
    render(<Card>content</Card>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Card className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
