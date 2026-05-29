import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Label } from './Label';

describe('Label', () => {
  it('renders its data-component attribute', () => {
    render(<Label>content</Label>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Label className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
