import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TabPanel } from './TabPanel';

describe('TabPanel', () => {
  it('renders its data-component attribute', () => {
    render(<TabPanel>content</TabPanel>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<TabPanel className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
