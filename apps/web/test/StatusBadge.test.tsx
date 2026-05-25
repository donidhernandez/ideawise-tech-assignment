import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from '../src/components/StatusBadge';

describe('<StatusBadge />', () => {
  it.each([
    ['idle', 'Idle'],
    ['initializing', 'Init…'],
    ['uploading', 'Uploading'],
    ['paused', 'Paused'],
    ['finalizing', 'Finalizing'],
    ['failed', 'Failed'],
    ['canceled', 'Canceled'],
  ] as const)('renders %s as "%s"', (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('renders "Complete" by default', () => {
    render(<StatusBadge status="complete" />);
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('renders "Deduplicated" when complete + deduplicated', () => {
    render(<StatusBadge status="complete" deduplicated />);
    expect(screen.getByText('Deduplicated')).toBeInTheDocument();
  });

  it('falls back to "Complete" when deduplicated=false', () => {
    render(<StatusBadge status="complete" deduplicated={false} />);
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });
});
