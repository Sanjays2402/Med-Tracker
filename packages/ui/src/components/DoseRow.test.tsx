import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DoseRow } from './DoseRow';

describe('DoseRow', () => {
  it('renders its data-component attribute', () => {
    render(<DoseRow>content</DoseRow>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<DoseRow className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
