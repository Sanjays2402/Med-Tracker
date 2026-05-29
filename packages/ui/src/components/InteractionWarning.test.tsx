import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InteractionWarning } from './InteractionWarning';

describe('InteractionWarning', () => {
  it('renders its data-component attribute', () => {
    render(<InteractionWarning>content</InteractionWarning>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<InteractionWarning className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
