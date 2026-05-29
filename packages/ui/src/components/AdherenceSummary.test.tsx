import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdherenceSummary } from './AdherenceSummary';

describe('AdherenceSummary', () => {
  it('renders its data-component attribute', () => {
    render(<AdherenceSummary>content</AdherenceSummary>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<AdherenceSummary className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
