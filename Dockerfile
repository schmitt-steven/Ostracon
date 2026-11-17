FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
RUN npx next build

FROM node:24-alpine AS runner
WORKDIR /app
RUN apk add --no-cache tini
RUN mkdir -p /data/uploads && chown -R node:node /data
VOLUME /data

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV UPLOAD_DIR=/data

COPY --chown=node:node --from=build /app/.next/standalone    ./
COPY --chown=node:node --from=build /app/.next/static        ./.next/static
COPY --chown=node:node --from=build /app/public              ./public
COPY --chown=node:node --from=build /app/drizzle/            ./drizzle
COPY --chown=node:node --from=build /app/docker/migrate.mjs  ./docker/migrate.mjs
COPY --chown=node:node --from=dependencies /app/node_modules/drizzle-orm  ./node_modules/drizzle-orm

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "node docker/migrate.mjs && exec node server.js"]
