import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrescriberSelect } from './PrescriberSelect';

describe('PrescriberSelect', () => {
  it('renders its data-component attribute', () => {
    render(<PrescriberSelect>content</PrescriberSelect>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<PrescriberSelect className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
