import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DialogBody } from './DialogBody';

describe('DialogBody', () => {
  it('renders its data-component attribute', () => {
    render(<DialogBody>content</DialogBody>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<DialogBody className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
