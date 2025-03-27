# toolreg

ToolREG enables you to provide infinity tools to LLM's.

- Schemas undergo additional processing on the first request (and are then cached). If your schemas vary from request to request, this may result in higher latencies.
- Schemas are cached for performance, and are not eligible for zero data retention.
