import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OnboardingModal } from './OnboardingModal';

describe('OnboardingModal component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Step 1 with Steam detection and navigates steps', async () => {
    const handleComplete = vi.fn();
    const handleScanFolder = vi.fn();
    const handleScanRoms = vi.fn();

    render(
      <OnboardingModal
        isOpen={true}
        onComplete={handleComplete}
        onOpenScanFolder={handleScanFolder}
        onOpenScanRoms={handleScanRoms}
      />
    );

    // Step 1: Steam detection
    expect(screen.getByText('Welcome to GameShelf')).toBeDefined();
    expect(screen.getByText('Steam Library Detection')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText(/Steam Detected/i)).toBeDefined();
    });

    // Advance to Step 2
    fireEvent.click(screen.getByText('Continue'));
    expect(screen.getByText('Standalone PC Games & ROMs')).toBeDefined();
    expect(screen.getByText('Scan Folder')).toBeDefined();
    expect(screen.getByText('Setup ROMs')).toBeDefined();

    // Advance to Step 3
    fireEvent.click(screen.getByText('Continue'));
    expect(screen.getByText('Artwork & Covers (Optional)')).toBeDefined();
    expect(screen.getByPlaceholderText('Paste your API key here...')).toBeDefined();

    // Advance to Step 4
    fireEvent.click(screen.getByText('Continue'));
    expect(screen.getByText("You're All Set!")).toBeDefined();
    expect(screen.getByText('Enter GameShelf Library')).toBeDefined();

    // Finish
    fireEvent.click(screen.getByText('Enter GameShelf Library'));
    await waitFor(() => {
      expect(handleComplete).toHaveBeenCalledTimes(1);
    });
  });

  it('allows skipping directly from header button', async () => {
    const handleComplete = vi.fn();

    render(
      <OnboardingModal
        isOpen={true}
        onComplete={handleComplete}
      />
    );

    const skipBtn = screen.getByRole('button', { name: /skip setup/i });
    fireEvent.click(skipBtn);
    await waitFor(() => {
      expect(handleComplete).toHaveBeenCalledTimes(1);
    });
  });
});
