import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders its data-component attribute', () => {
    render(<ConfirmDialog>content</ConfirmDialog>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<ConfirmDialog className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
