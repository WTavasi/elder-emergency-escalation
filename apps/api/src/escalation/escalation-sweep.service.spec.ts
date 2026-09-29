import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { EscalationSweepService } from './escalation-sweep.service';
import type { EscalationListener } from './escalation.listener';

const buildConfig = (settings: Record<string, unknown> = {}) =>
  ({
    get: (key: string, fallback: unknown) => settings[key] ?? fallback,
  }) as unknown as ConfigService;

const buildListener = (result = { fired: 0, rearmed: 0 }) =>
  ({
    recoverPendingTimers: jest.fn().mockResolvedValue(result),
  }) as unknown as EscalationListener & { recoverPendingTimers: jest.Mock };

describe('EscalationSweepService', () => {
  describe('starting', () => {
    it('arms an interval and does not sweep immediately', () => {
      const listener = buildListener();
      const sweep = new EscalationSweepService(buildConfig(), listener);

      sweep.onModuleInit();

      // Boot recovery has just done this work from the listener, milliseconds earlier.
      expect(listener.recoverPendingTimers).not.toHaveBeenCalled();
      sweep.onModuleDestroy();
    });

    it('does nothing at all when disabled', () => {
      const listener = buildListener();
      const sweep = new EscalationSweepService(
        buildConfig({ ESCALATION_SWEEP_ENABLED: false }),
        listener,
      );

      sweep.onModuleInit();
      sweep.onModuleDestroy();

      expect(listener.recoverPendingTimers).not.toHaveBeenCalled();
    });

    it('sweeps on the configured interval', async () => {
      jest.useFakeTimers();
      const listener = buildListener();
      const sweep = new EscalationSweepService(
        buildConfig({ ESCALATION_SWEEP_INTERVAL_MS: 5000 }),
        listener,
      );

      sweep.onModuleInit();

      // The async variant, because each pass has to be allowed to settle before the next
      // tick. Advancing synchronously leaves the first sweep's promise pending, the
      // in-flight guard skips the second tick, and the test then measures the guard
      // rather than the interval.
      await jest.advanceTimersByTimeAsync(12_000);

      expect(listener.recoverPendingTimers).toHaveBeenCalledTimes(2);
      sweep.onModuleDestroy();
      jest.useRealTimers();
    });
  });

  describe('sweeping', () => {
    it('reconciles by running the same code as boot recovery', async () => {
      const listener = buildListener();
      await new EscalationSweepService(buildConfig(), listener).sweep();

      expect(listener.recoverPendingTimers).toHaveBeenCalledTimes(1);
    });

    it('survives a failure so the next pass still happens', async () => {
      const listener = buildListener();
      listener.recoverPendingTimers.mockRejectedValueOnce(new Error('database unreachable'));
      const sweep = new EscalationSweepService(buildConfig(), listener);

      // Must not throw. An unhandled rejection on an interval callback would take the
      // process down, costing every future escalation to save one.
      await expect(sweep.sweep()).resolves.toBeUndefined();

      await sweep.sweep();
      expect(listener.recoverPendingTimers).toHaveBeenCalledTimes(2);
    });

    it('does not start a second pass while the first is still running', async () => {
      const listener = buildListener();
      let release: (value: { fired: number; rearmed: number }) => void = () => {};
      listener.recoverPendingTimers.mockReturnValue(
        new Promise((resolve) => {
          release = resolve;
        }),
      );
      const sweep = new EscalationSweepService(buildConfig(), listener);

      const first = sweep.sweep();
      await sweep.sweep();

      expect(listener.recoverPendingTimers).toHaveBeenCalledTimes(1);
      release({ fired: 0, rearmed: 0 });
      await first;
    });

    it('warns when it had to promote something, because that means the listener missed it', async () => {
      const listener = buildListener({ fired: 2, rearmed: 0 });
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

      await new EscalationSweepService(buildConfig(), listener).sweep();

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('promoted 2'));
      warn.mockRestore();
    });

    it('says nothing on a quiet pass, so the warning above is not buried', async () => {
      const listener = buildListener({ fired: 0, rearmed: 3 });
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

      await new EscalationSweepService(buildConfig(), listener).sweep();

      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});
