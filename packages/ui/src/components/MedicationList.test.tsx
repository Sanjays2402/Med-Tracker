import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MedicationList } from './MedicationList';

describe('MedicationList', () => {
  it('renders its data-component attribute', () => {
    render(<MedicationList>content</MedicationList>);
    expect(screen.getByText('content')).toBeTruthy();
  });
  it('forwards a className', () => {
    const { container } = render(<MedicationList className="extra" />);
    expect(container.firstChild).toHaveProperty('className');
  });
});
