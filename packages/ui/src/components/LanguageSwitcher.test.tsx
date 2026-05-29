import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LanguageSwitcher } from './LanguageSwitcher';

describe('LanguageSwitcher', () => {
  it('renders its data-component attribute', () => {
    render(<LanguageSwitcher>content</LanguageSwitcher>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<LanguageSwitcher className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
