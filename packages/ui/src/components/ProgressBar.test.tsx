import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
  it('renders its data-component attribute', () => {
    render(<ProgressBar>content</ProgressBar>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<ProgressBar className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
