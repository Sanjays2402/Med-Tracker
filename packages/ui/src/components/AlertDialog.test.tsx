import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlertDialog } from './AlertDialog';

describe('AlertDialog', () => {
  it('renders its data-component attribute', () => {
    render(<AlertDialog>content</AlertDialog>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<AlertDialog className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
