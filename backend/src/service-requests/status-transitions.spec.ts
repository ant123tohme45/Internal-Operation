import { canCancel, canTransition, explainRejectedTransition } from './status-transitions';

/**
 * Unit test for the business rule behind the Week 3 cancel flow
 * (data-model.md section 3 "Lifecycle"): an employee may only cancel a
 * request that hasn't been picked up yet. This is pure domain logic with no
 * HTTP layer and no database involved on purpose — it should be true no
 * matter how the rule ends up being called.
 */
describe('canCancel (business rule)', () => {
  it('allows cancelling a request that is still SUBMITTED', () => {
    expect(canCancel('SUBMITTED')).toBe(true);
  });

  it.each(['IN_PROGRESS', 'RESOLVED', 'REJECTED', 'CANCELLED'] as const)(
    'refuses to cancel a request that is already %s',
    (status) => {
      expect(canCancel(status)).toBe(false);
    },
  );
});

describe('canTransition / explainRejectedTransition (existing Week 2 rule, still enforced)', () => {
  it('allows the documented forward path', () => {
    expect(canTransition('SUBMITTED', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'RESOLVED')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'REJECTED')).toBe(true);
  });

  it('refuses to move backward', () => {
    expect(canTransition('IN_PROGRESS', 'SUBMITTED')).toBe(false);
    expect(explainRejectedTransition('IN_PROGRESS', 'SUBMITTED')).toMatch(/backward/);
  });

  it('refuses to skip IN_PROGRESS', () => {
    expect(canTransition('SUBMITTED', 'RESOLVED')).toBe(false);
    expect(explainRejectedTransition('SUBMITTED', 'RESOLVED')).toMatch(/skip/);
  });

  it('treats terminal statuses as terminal', () => {
    expect(canTransition('RESOLVED', 'IN_PROGRESS')).toBe(false);
    expect(canTransition('REJECTED', 'IN_PROGRESS')).toBe(false);
    expect(canTransition('CANCELLED', 'IN_PROGRESS')).toBe(false);
  });
});
