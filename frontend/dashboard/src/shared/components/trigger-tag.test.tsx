import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TriggerTag } from './parts';

describe('TriggerTag', () => {
  it('marks an emergency raised by a check-in nobody answered, and says what that means', () => {
    render(<TriggerTag trigger="MISSED_CHECK_IN" />);

    const tag = screen.getByText('Missed check-in');
    expect(tag).toBeInTheDocument();
    expect(tag).toHaveAccessibleDescription(/did not answer a daily check-in/);
  });

  it('adds nothing to a press of the button, which is every other emergency', () => {
    const { container } = render(<TriggerTag trigger="PANIC" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('adds nothing when talking to an API that does not send the field yet', () => {
    const { container } = render(<TriggerTag />);
    expect(container).toBeEmptyDOMElement();
  });
});
