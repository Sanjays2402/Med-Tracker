import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Select } from './Select';

describe('Select', () => {
  it('renders its data-component attribute', () => {
    render(<Select>content</Select>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Select className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
