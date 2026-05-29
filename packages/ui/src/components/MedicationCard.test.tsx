import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MedicationCard } from './MedicationCard';

describe('MedicationCard', () => {
  it('renders its data-component attribute', () => {
    render(<MedicationCard>content</MedicationCard>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<MedicationCard className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
