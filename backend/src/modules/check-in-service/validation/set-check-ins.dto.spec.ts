import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { ConfirmCheckInsDto, SetCheckInsDto } from './set-check-ins.dto';

/** The same pipe the API installs globally in main.ts. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const check = (body: unknown, metatype: new () => object = SetCheckInsDto) =>
  pipe.transform(body, { type: 'body', metatype });

describe('the check-in request shapes', () => {
  it('accepts up to three times of day and a time to answer', async () => {
    await expect(
      check({ enabled: true, times: ['09:00', '7:30', '23:59'], graceMinutes: 45 }),
    ).resolves.toMatchObject({ enabled: true, graceMinutes: 45 });
  });

  it('accepts turning it off with no times', async () => {
    await expect(check({ enabled: false, times: [] })).resolves.toMatchObject({ enabled: false });
  });

  it.each([
    ['four times a day', { enabled: true, times: ['08:00', '12:00', '16:00', '20:00'] }],
    ['a time that is not one', { enabled: true, times: ['25:00'] }],
    ['the same time twice', { enabled: true, times: ['09:00', '09:00'] }],
    ['under ten minutes to answer', { enabled: true, times: ['09:00'], graceMinutes: 5 }],
    ['over two hours to answer', { enabled: true, times: ['09:00'], graceMinutes: 180 }],
    ['no on or off', { times: ['09:00'] }],
    ['a field nobody asked for', { enabled: true, times: ['09:00'], timezone: 'UTC' }],
  ])('refuses %s', async (_label, body) => {
    await expect(check(body)).rejects.toThrow(BadRequestException);
  });

  it('needs a yes or a no to agree', async () => {
    await expect(check({ agree: true }, ConfirmCheckInsDto)).resolves.toMatchObject({
      agree: true,
    });
    await expect(check({}, ConfirmCheckInsDto)).rejects.toThrow(BadRequestException);
  });
});
