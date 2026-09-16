import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';

/**
 * Reads the acting identity off the `X-Employee-Id` header. This stands in
 * for a login session (see docs/full-stack-delivery.md, "What we did
 * not build") — every mutating request says who it's acting as, and the
 * service layer is the one place that checks whether that identity is a
 * known employee and, for cancel, whether it owns the request.
 *
 * Missing/blank header is an invalid request (400), not a 401/403 — those
 * status codes are reserved for a known identity that isn't allowed to do
 * the thing it's asking for.
 */
export const CurrentEmployeeId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const header = request.headers['x-employee-id'];
    const employeeId = Array.isArray(header) ? header[0] : header;

    if (!employeeId || !employeeId.trim()) {
      throw new BadRequestException(
        'Missing "X-Employee-Id" header — every request must say which employee it is acting as.',
      );
    }

    return employeeId;
  },
);
