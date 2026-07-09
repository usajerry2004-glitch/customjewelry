import {
  ExceptionFilter, Catch, ArgumentsHost,
  HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Only ship unexpected server errors to Sentry — 4xx are expected client mistakes
    if (status >= 500) {
      Sentry.captureException(exception);
      this.logger.error(
        `${request.method} ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // Built-in HttpException subclasses (BadRequestException, ConflictException, etc.)
    // return a full { statusCode, message, error } object from getResponse() even
    // when constructed with a plain string — nesting that whole object under our
    // own `message` key means every client-side `data?.message` read gets an
    // object instead of a string (or string[] for validation errors).
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : null;
    const message =
      exceptionResponse === null
        ? 'Internal server error'
        : typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message ?? 'Unexpected error';

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    });
  }
}
