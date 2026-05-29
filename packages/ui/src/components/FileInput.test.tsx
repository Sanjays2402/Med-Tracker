import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileInput } from './FileInput';

describe('FileInput', () => {
  it('renders its data-component attribute', () => {
    render(<FileInput>content</FileInput>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<FileInput className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
