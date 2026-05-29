import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NumberInput } from './NumberInput';

describe('NumberInput', () => {
  it('renders its data-component attribute', () => {
    render(<NumberInput>content</NumberInput>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<NumberInput className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
