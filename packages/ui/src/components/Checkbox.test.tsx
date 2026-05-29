import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('renders its data-component attribute', () => {
    render(<Checkbox>content</Checkbox>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Checkbox className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
