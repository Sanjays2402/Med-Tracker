import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tag } from './Tag';

describe('Tag', () => {
  it('renders its data-component attribute', () => {
    render(<Tag>content</Tag>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Tag className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
