import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExportButton } from './ExportButton';

describe('ExportButton', () => {
  it('renders its data-component attribute', () => {
    render(<ExportButton>content</ExportButton>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<ExportButton className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
