import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SkipButton } from './SkipButton';

describe('SkipButton', () => {
  it('renders its data-component attribute', () => {
    render(<SkipButton>content</SkipButton>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<SkipButton className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
