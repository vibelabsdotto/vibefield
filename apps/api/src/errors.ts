import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';

export class ApiError extends HttpException {
  constructor(status: number, code: string, message: string, details?: unknown) { super({ error: { code, message, ...(details === undefined ? {} : { details }) } }, status); }
}
export function fail(code: string, message: string, status = 422): never { throw new ApiError(status, code, message); }
@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) { response.end(); return; }
    if (error instanceof ZodError) { response.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: error.issues.map(i => ({ path: i.path, message: i.message })) } }); return; }
    if (error instanceof ApiError) { response.status(error.getStatus()).json(error.getResponse()); return; }
    const parserError = error as { status?: unknown; type?: unknown };
    if (parserError?.type === 'entity.parse.failed' || parserError?.type === 'entity.too.large') { response.status(parserError.type === 'entity.too.large' ? 413 : 400).json({ error: { code: parserError.type === 'entity.too.large' ? 'BODY_TOO_LARGE' : 'INVALID_JSON', message: parserError.type === 'entity.too.large' ? 'JSON body exceeds the 2MB limit' : 'Request body is not valid JSON' } }); return; }
    if (error instanceof HttpException) { response.status(error.getStatus()).json({ error: { code: error.getStatus() === 404 ? 'NOT_FOUND' : 'BAD_REQUEST', message: error.getStatus() === 404 ? 'Route not found' : 'Request rejected' } }); return; }
    const code = (error as { code?: unknown })?.code;
    if (typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT')) { response.status(409).json({ error: { code: 'CONFLICT', message: 'This operation conflicts with an existing relation' } }); return; }
    // Do not serialize provider responses, credentials, stack traces, or local paths.
    response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'The operation failed. Check the local server console.' } });
    console.error('VibeField internal operation failed:', error instanceof Error ? error.name : 'UnknownError');
  }
}
