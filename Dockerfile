# Container image for node-red-mcp in Streamable HTTP mode with admin UI.
FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-package-lock

COPY bin ./bin
COPY lib ./lib

RUN mkdir -p /data && chown node:node /data

USER node

ENV NODE_ENV=production \
    MCP_TRANSPORT=http \
    MCP_HTTP_PORT=3000 \
    NR_MCP_DATA_DIR=/data

VOLUME /data

EXPOSE 3000

CMD ["node", "bin/node-red-mcp-server.mjs", "--http", "3000"]
