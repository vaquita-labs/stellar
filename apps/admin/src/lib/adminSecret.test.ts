import { beforeEach, describe, expect, it, vi } from 'vitest';

// The role lookup is the only part that touches the database; everything else
// in adminSecret.ts is exercised through it with a stubbed Prisma client.
const findUnique = vi.fn();
const findFirst = vi.fn();
vi.mock('@vaquita/db', () => ({ prisma: { adminUser: { findUnique, findFirst } } }));

const { roleFor } = await import('./adminSecret');

describe('roleFor', () => {
  beforeEach(() => {
    findUnique.mockReset();
    findFirst.mockReset();
  });

  it('returns the row role for a listed, enabled email', async () => {
    findUnique.mockResolvedValue({ role: 'operator', disabledAt: null });
    expect(await roleFor('ana@vaquita.fi')).toBe('operator');
    findUnique.mockResolvedValue({ role: 'read-only', disabledAt: null });
    expect(await roleFor('bo@vaquita.fi')).toBe('read-only');
  });

  it('locks out a disabled email', async () => {
    findUnique.mockResolvedValue({ role: 'operator', disabledAt: new Date() });
    expect(await roleFor('ana@vaquita.fi')).toBeNull();
  });

  it('treats an unlisted email as read-only once anyone is listed', async () => {
    findUnique.mockResolvedValue(null);
    findFirst.mockResolvedValue({ email: 'someone@vaquita.fi' });
    expect(await roleFor('new@vaquita.fi')).toBe('read-only');
  });

  it('bootstraps: an unlisted email is an operator while the table is empty', async () => {
    findUnique.mockResolvedValue(null);
    findFirst.mockResolvedValue(null);
    expect(await roleFor('first@vaquita.fi')).toBe('operator');
  });
});
