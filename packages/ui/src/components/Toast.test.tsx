import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Toast } from './Toast';

describe('Toast', () => {
  it('renders its data-component attribute', () => {
    render(<Toast>content</Toast>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Toast className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
