import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Fieldset } from './Fieldset';

describe('Fieldset', () => {
  it('renders its data-component attribute', () => {
    render(<Fieldset>content</Fieldset>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Fieldset className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
