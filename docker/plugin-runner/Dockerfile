# Minimal Node.js Plugin Runner for code-to-gate
# This image is used for sandbox execution of plugins

FROM node:20-alpine

# Install minimal dependencies
RUN apk add --no-cache \
    dumb-init \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -S plugin && adduser -S node -G plugin

# Create directories
RUN mkdir -p /plugin/work /plugin/code /plugin/io \
    && chown -R node:plugin /plugin

# Set working directory
WORKDIR /plugin/work

# Copy plugin runner script
COPY plugin-runner.js /usr/local/bin/plugin-runner.js
RUN chmod 755 /usr/local/bin/plugin-runner.js

# Set permissions
RUN chmod 755 /plugin/work

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD node -e "process.exit(0)" || exit 1

# Switch to non-root user
USER node

# Default entrypoint
ENTRYPOINT ["dumb-init", "--", "node", "/usr/local/bin/plugin-runner.js"]

# Default command (can be overridden)
CMD ["--help"]