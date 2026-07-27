import { isMessageVisible } from './message-visibility';

describe('isMessageVisible', () => {
  const internalMsg = { isInternal: true, authorId: 'admin-1', mentions: [] as string[] };
  const publicMsg = { isInternal: false, authorId: 'admin-1', mentions: [] as string[] };

  it('hides internal messages from CUSTOMER', () => {
    expect(isMessageVisible('CUSTOMER', 'cust-1', internalMsg)).toBe(false);
  });

  it('shows public messages to CUSTOMER', () => {
    expect(isMessageVisible('CUSTOMER', 'cust-1', publicMsg)).toBe(true);
  });

  it('hides an internal message from a FACTORY_MANAGER who is not the author or mentioned', () => {
    expect(isMessageVisible('FACTORY_MANAGER', 'factory-1', internalMsg)).toBe(false);
  });

  it('hides an internal message from a STONE_MANAGER who is not the author or mentioned', () => {
    expect(isMessageVisible('STONE_MANAGER', 'stone-1', internalMsg)).toBe(false);
  });

  it('shows an internal message to the FACTORY_MANAGER who authored it', () => {
    expect(isMessageVisible('FACTORY_MANAGER', 'admin-1', internalMsg)).toBe(true);
  });

  it('shows an internal message to a FACTORY_MANAGER who is @mentioned in it', () => {
    const mentioning = { ...internalMsg, mentions: ['factory-1'] };
    expect(isMessageVisible('FACTORY_MANAGER', 'factory-1', mentioning)).toBe(true);
  });

  it('shows internal messages to unrestricted staff roles (ADMIN, AUTHORIZER, SALES_REP, CAD_DESIGNER)', () => {
    expect(isMessageVisible('ADMIN', 'admin-2', internalMsg)).toBe(true);
    expect(isMessageVisible('AUTHORIZER', 'auth-1', internalMsg)).toBe(true);
    expect(isMessageVisible('SALES_REP', 'sales-1', internalMsg)).toBe(true);
    expect(isMessageVisible('CAD_DESIGNER', 'cad-1', internalMsg)).toBe(true);
  });
});
