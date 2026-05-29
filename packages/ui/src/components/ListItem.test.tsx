import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ListItem } from './ListItem';

describe('ListItem', () => {
  it('renders its data-component attribute', () => {
    render(<ListItem>content</ListItem>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<ListItem className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
