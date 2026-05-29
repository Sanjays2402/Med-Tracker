import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CaregiverShareCard } from './CaregiverShareCard';

describe('CaregiverShareCard', () => {
  it('renders its data-component attribute', () => {
    render(<CaregiverShareCard>content</CaregiverShareCard>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<CaregiverShareCard className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
