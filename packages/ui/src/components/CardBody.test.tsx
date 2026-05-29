import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardBody } from './CardBody';

describe('CardBody', () => {
  it('renders its data-component attribute', () => {
    render(<CardBody>content</CardBody>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<CardBody className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
