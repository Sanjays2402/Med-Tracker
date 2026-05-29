import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RadioGroup } from './RadioGroup';

describe('RadioGroup', () => {
  it('renders its data-component attribute', () => {
    render(<RadioGroup>content</RadioGroup>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<RadioGroup className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
