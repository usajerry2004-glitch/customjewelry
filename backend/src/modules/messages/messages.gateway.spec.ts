import { MessagesGateway } from './messages.gateway';

// Exercises the exact scenario this module exists to prevent: an Admin
// posts an internal-only note on an order, and a Factory Manager who's
// connected to that order's room (but isn't the author or mentioned) must
// not receive it over the socket — same rule the REST fetch already
// enforces via isMessageVisible, just applied per-socket instead of as a
// room-wide broadcast.
describe('MessagesGateway.broadcastNewMessage', () => {
  const makeSocket = (user: { id: string; role: string } | null) => ({
    data: user ? { user, userName: user.id } : {},
    emit: jest.fn(),
  });

  const buildGateway = (sockets: ReturnType<typeof makeSocket>[]) => {
    const gateway = new MessagesGateway(
      {} as any, // JwtService — unused by broadcastNewMessage
      {} as any, // ConfigService — unused by broadcastNewMessage
      {} as any, // OrdersService — unused by broadcastNewMessage
      {} as any, // User repo — unused by broadcastNewMessage
    );
    gateway.server = {
      in: jest.fn().mockReturnValue({
        fetchSockets: jest.fn().mockResolvedValue(sockets),
      }),
    } as any;
    return gateway;
  };

  it('does not emit an internal message to a Factory Manager who is not the author or mentioned', async () => {
    const adminSocket = makeSocket({ id: 'admin-1', role: 'ADMIN' });
    const factorySocket = makeSocket({ id: 'factory-1', role: 'FACTORY_MANAGER' });
    const gateway = buildGateway([adminSocket, factorySocket]);

    await gateway.broadcastNewMessage('order-1', { isInternal: true, authorId: 'admin-1', mentions: [] });

    expect(adminSocket.emit).toHaveBeenCalledWith('message:new', expect.anything());
    expect(factorySocket.emit).not.toHaveBeenCalled();
  });

  it('does emit to the Factory Manager once they are @mentioned in the internal message', async () => {
    const adminSocket = makeSocket({ id: 'admin-1', role: 'ADMIN' });
    const factorySocket = makeSocket({ id: 'factory-1', role: 'FACTORY_MANAGER' });
    const gateway = buildGateway([adminSocket, factorySocket]);

    await gateway.broadcastNewMessage('order-1', { isInternal: true, authorId: 'admin-1', mentions: ['factory-1'] });

    expect(adminSocket.emit).toHaveBeenCalledWith('message:new', expect.anything());
    expect(factorySocket.emit).toHaveBeenCalledWith('message:new', expect.anything());
  });

  it('emits public (non-internal) messages to everyone in the room', async () => {
    const adminSocket = makeSocket({ id: 'admin-1', role: 'ADMIN' });
    const factorySocket = makeSocket({ id: 'factory-1', role: 'FACTORY_MANAGER' });
    const customerSocket = makeSocket({ id: 'cust-1', role: 'CUSTOMER' });
    const gateway = buildGateway([adminSocket, factorySocket, customerSocket]);

    await gateway.broadcastNewMessage('order-1', { isInternal: false, authorId: 'admin-1', mentions: [] });

    expect(adminSocket.emit).toHaveBeenCalledWith('message:new', expect.anything());
    expect(factorySocket.emit).toHaveBeenCalledWith('message:new', expect.anything());
    expect(customerSocket.emit).toHaveBeenCalledWith('message:new', expect.anything());
  });

  it('skips sockets with no authenticated user attached', async () => {
    const unauthedSocket = makeSocket(null);
    const gateway = buildGateway([unauthedSocket]);

    await gateway.broadcastNewMessage('order-1', { isInternal: false, authorId: 'admin-1', mentions: [] });

    expect(unauthedSocket.emit).not.toHaveBeenCalled();
  });
});
