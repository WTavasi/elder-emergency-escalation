import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader';

describe('the browser tab', () => {
  it('is named after the page, with no em dash', () => {
    render(
      <MemoryRouter>
        <PageHeader title="Users" />
      </MemoryRouter>,
    );
    expect(document.title).toBe('Users | MzaziCare');
    expect(document.title).not.toContain('—');
  });
});
