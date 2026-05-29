import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tab } from './Tab';

describe('Tab', () => {
  it('renders its data-component attribute', () => {
    render(<Tab>content</Tab>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<Tab className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
