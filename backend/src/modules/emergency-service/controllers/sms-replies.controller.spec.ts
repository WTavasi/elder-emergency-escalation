import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { SmsRepliesService } from '../services/sms-replies.service';
import { SmsRepliesController } from './sms-replies.controller';

const SECRET = 'a-long-test-secret-for-replies';

function build(secret: string | null = SECRET) {
  const replies = { handle: jest.fn().mockResolvedValue('accepted') };
  const config = { get: jest.fn(() => secret ?? undefined) } as unknown as ConfigService;
  const controller = new SmsRepliesController(replies as unknown as SmsRepliesService, config);
  return { controller, replies };
}

const reply = { from: '+254700000030', to: '12345', text: '1', id: 'ATXid_1', linkId: 'x' };

describe('SmsRepliesController', () => {
  it('passes the sender and the words on when the secret matches', async () => {
    const t = build();

    await expect(t.controller.inbound(SECRET, reply)).resolves.toEqual({ received: true });
    expect(t.replies.handle).toHaveBeenCalledWith('+254700000030', '1');
  });

  it('is not there at all for a wrong or missing secret', async () => {
    const t = build();

    await expect(t.controller.inbound('wrong', reply)).rejects.toBeInstanceOf(NotFoundException);
    await expect(t.controller.inbound(undefined, reply)).rejects.toBeInstanceOf(NotFoundException);
    expect(t.replies.handle).not.toHaveBeenCalled();
  });

  it('is not there at all when replying by text is off', async () => {
    const t = build(null);

    await expect(t.controller.inbound(SECRET, reply)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 200 even when handling fails, so the gateway does not send it again', async () => {
    const t = build();
    t.replies.handle.mockRejectedValue(new Error('database away'));

    await expect(t.controller.inbound(SECRET, reply)).resolves.toEqual({ received: true });
  });

  it('copes with a body that is missing its fields', async () => {
    const t = build();

    await t.controller.inbound(SECRET, {});
    expect(t.replies.handle).toHaveBeenCalledWith('', '');
  });
});
