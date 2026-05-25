import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { HistoryPanel } from '../src/components/HistoryPanel';
import { useUploadStore } from '../src/store/uploadStore';

describe('<HistoryPanel />', () => {
  beforeEach(() => {
    useUploadStore.setState({ items: [], history: [], _handles: new Map() });
  });

  it('shows the empty state when there is no history', () => {
    render(<HistoryPanel />);
    expect(screen.getByText(/past uploads will appear here/i)).toBeInTheDocument();
  });

  it('lists history entries with name, size, and timestamp', () => {
    useUploadStore.setState({
      history: [
        {
          localId: 'a',
          name: 'cat.jpg',
          size: 2048,
          mimeType: 'image/jpeg',
          url: '/uploads/cat.jpg',
          deduplicated: false,
          uploadedAt: Date.now() - 3_000,
        },
      ],
    });
    render(<HistoryPanel />);
    expect(screen.getByText('cat.jpg')).toBeInTheDocument();
    expect(screen.getByText(/2\.0 KB/)).toBeInTheDocument();
    expect(screen.getByText(/ago$/)).toBeInTheDocument();
  });

  it('renders a deduped marker for dedup entries', () => {
    useUploadStore.setState({
      history: [
        {
          localId: 'a',
          name: 'twin.jpg',
          size: 1,
          mimeType: 'image/jpeg',
          url: '/x',
          deduplicated: true,
          uploadedAt: Date.now(),
        },
      ],
    });
    render(<HistoryPanel />);
    expect(screen.getByText('deduped')).toBeInTheDocument();
  });

  it('the Clear button empties the persisted history', () => {
    useUploadStore.setState({
      history: [
        {
          localId: 'a',
          name: 'a.jpg',
          size: 1,
          mimeType: 'image/jpeg',
          url: '/x',
          deduplicated: false,
          uploadedAt: Date.now(),
        },
      ],
    });
    render(<HistoryPanel />);
    fireEvent.click(screen.getByText('Clear'));
    expect(useUploadStore.getState().history).toHaveLength(0);
  });
});
