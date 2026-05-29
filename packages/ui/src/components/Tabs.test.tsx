import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tabs } from './Tabs';

describe('Tabs', () => {
  it('renders its data-component attribute', () => {
    render(<Tabs>content</Tabs>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Tabs className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
