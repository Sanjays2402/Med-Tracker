import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Slider } from './Slider';

describe('Slider', () => {
  it('renders its data-component attribute', () => {
    render(<Slider>content</Slider>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Slider className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
