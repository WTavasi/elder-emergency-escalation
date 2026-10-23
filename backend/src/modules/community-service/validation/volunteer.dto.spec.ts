import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ApplyDto, ReviewDto } from './volunteer.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
const check = (body: unknown, metatype: new () => object = ApplyDto) =>
  pipe.transform(body, { type: 'body', metatype });

const VALID = {
  training: ['FIRST_AID', 'CPR'],
  area: { label: 'Kileleshwa, Nairobi', latitude: -1.2833, longitude: 36.7833 },
  radiusKm: 1.5,
};

describe('the volunteer request shapes', () => {
  it('accepts training, an area and a radius', async () => {
    await expect(check(VALID)).resolves.toMatchObject({ radiusKm: 1.5 });
  });

  it.each([
    ['no training', { ...VALID, training: [] }],
    ['training nobody offers', { ...VALID, training: ['SURGEON'] }],
    ['a radius under half a kilometre', { ...VALID, radiusKm: 0.2 }],
    ['a radius over five kilometres', { ...VALID, radiusKm: 12 }],
    ['an area off the map', { ...VALID, area: { ...VALID.area, latitude: 120 } }],
    ['no area', { training: ['CPR'], radiusKm: 1 }],
    ['an ID number', { ...VALID, nationalId: '12345678' }],
  ])('refuses %s', async (_label, body) => {
    await expect(check(body)).rejects.toThrow(BadRequestException);
  });

  it('a review is approve, reject or suspend', async () => {
    await expect(check({ decision: 'approve' }, ReviewDto)).resolves.toBeDefined();
    await expect(check({ decision: 'promote' }, ReviewDto)).rejects.toThrow(BadRequestException);
  });
});
