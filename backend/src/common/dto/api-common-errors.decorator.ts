import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ApiErrorDto } from './api-error.dto.js';

// Standard error contract shared by all JWT-protected controllers.
export function ApiCommonErrors() {
  return applyDecorators(
    ApiResponse({
      status: 400,
      description: 'Validation failure or rejected business rule',
      type: ApiErrorDto,
    }),
    ApiResponse({
      status: 401,
      description: 'Missing, malformed or expired bearer token',
      type: ApiErrorDto,
    }),
    ApiResponse({
      status: 404,
      description: 'Resource not found or not owned by the authenticated user',
      type: ApiErrorDto,
    }),
  );
}
