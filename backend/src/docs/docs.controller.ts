import { Controller, Get, Header } from '@nestjs/common';

// Interactive Swagger UI. The @nestjs/swagger UI middleware does not serve
// under this stack's Express 5 router, so the UI is plain HTML loading
// Swagger UI from CDN against the local OpenAPI JSON document.
@Controller('docs')
export class DocsController {
  @Get()
  @Header('Content-Type', 'text/html')
  ui(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TakeFlow API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({ url: 'docs-json', dom_id: '#swagger-ui' });
  </script>
</body>
</html>`;
  }
}
