import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Divider } from './Divider';

describe('Divider', () => {
  it('renders its data-component attribute', () => {
    render(<Divider>content</Divider>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Divider className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
