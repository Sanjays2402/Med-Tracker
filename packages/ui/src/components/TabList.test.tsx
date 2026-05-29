import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TabList } from './TabList';

describe('TabList', () => {
  it('renders its data-component attribute', () => {
    render(<TabList>content</TabList>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<TabList className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
