import { type ArgumentsHost, Catch, type ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { isUniqueViolation } from './db-errors.js';
import { describeError } from './log.js';
import { DeskError, sendJson } from './http.js';
import { describeIssues } from './validation-messages.js';

@Catch()
export class DeskExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Desk');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    if (exception instanceof DeskError) {
      const body = exception.code
        ? { error: exception.message, code: exception.code }
        : { error: exception.message };
      return sendJson(res, body, exception.status);
    }
    if (exception instanceof ZodError) return sendJson(res, { error: describeIssues(exception.issues) }, 400);
    if (isUniqueViolation(exception, 'tc_accepted_dossiers')) {
      return sendJson(
        res,
        { error: 'Ce dossier possède déjà un ajout accepté. Aucun doublon n’a été enregistré.' },
        409,
      );
    }
    this.logger.error(describeError(exception));
    if (req.method === 'GET') {
      return sendJson(res, { error: 'L’espace n’est pas accessible pour le moment. Réessayez.' }, 503);
    }
    return sendJson(res, { error: 'L’action n’a pas pu être enregistrée. Réessayez.' }, 500);
  }
}
