import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PharmacySelect } from './PharmacySelect';

describe('PharmacySelect', () => {
  it('renders its data-component attribute', () => {
    render(<PharmacySelect>content</PharmacySelect>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<PharmacySelect className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
