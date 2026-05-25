import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilePicker } from '../src/components/FilePicker';

function file(name: string, type: string, size: number): File {
  return new File([new Blob([new Uint8Array(size)])], name, { type });
}

describe('<FilePicker />', () => {
  it('shows the helper text and accepts an image via the input', async () => {
    const onAccept = vi.fn();
    render(<FilePicker onAccept={onAccept} />);

    expect(screen.getByText(/drag & drop files/i)).toBeInTheDocument();

    const input = screen.getByLabelText(/file input/i) as HTMLInputElement;
    const valid = file('photo.jpg', 'image/jpeg', 100);
    fireEvent.change(input, { target: { files: [valid] } });

    // react-dropzone runs file-type validation asynchronously
    await new Promise((r) => setTimeout(r, 50));
    expect(onAccept).toHaveBeenCalledWith([valid]);
  });

  it('does not call onAccept when no files match the accept filter', async () => {
    const onAccept = vi.fn();
    render(<FilePicker onAccept={onAccept} />);

    // Use the validation module's own classification through the picker:
    // the input has accept="image/*,video/*" so a text/plain file is filtered
    // out at the browser/file-input boundary by react-dropzone before reaching
    // our onDrop. We assert the negative case here.
    const input = screen.getByLabelText(/file input/i) as HTMLInputElement;
    const invalid = file('script.txt', 'text/plain', 10);
    fireEvent.change(input, { target: { files: [invalid] } });
    await new Promise((r) => setTimeout(r, 50));
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('respects disabled prop by reducing opacity and preventing input', () => {
    render(<FilePicker onAccept={vi.fn()} disabled />);
    const dropzone = screen.getByTestId('file-picker');
    expect(dropzone.className).toMatch(/opacity-50/);
    expect(dropzone.className).toMatch(/pointer-events-none/);
  });
});
