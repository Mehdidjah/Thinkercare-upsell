import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger, NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { describeError } from './log.js';
import { renderErrorPage, renderNotFoundPage } from './pages.js';
import { requestPath } from './security.js';
import { sendJson } from './http.js';

@Catch()
export class PageExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const path = requestPath(req.originalUrl);
    const isApi = path.startsWith('/api/') || path === '/healthz';
    if (exception instanceof NotFoundException) {
      if (path.startsWith('/api/')) {
        res.status(404).json(exception.getResponse());
        return;
      }
      res.status(404).type('text/html; charset=utf-8').send(renderNotFoundPage());
      return;
    }
    if (!(exception instanceof HttpException)) this.logger.error(describeError(exception));
    if (isApi) {
      if (exception instanceof HttpException) {
        sendJson(res, exception.getResponse(), exception.getStatus());
      } else {
        sendJson(res, { statusCode: 500, message: 'Internal server error' }, 500);
      }
      return;
    }
    res.status(500).type('text/html; charset=utf-8').send(renderErrorPage());
  }
}
