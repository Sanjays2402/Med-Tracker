import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TakeButton } from './TakeButton';

describe('TakeButton', () => {
  it('renders its data-component attribute', () => {
    render(<TakeButton>content</TakeButton>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<TakeButton className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
