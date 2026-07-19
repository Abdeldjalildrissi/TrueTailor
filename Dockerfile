# ---------- dependencies ----------
FROM node:22-slim AS deps
WORKDIR /app
# All native modules (@libsql/client, @node-rs/argon2) ship prebuilt binaries
# through the npm registry — no compiler toolchain required at any stage.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- build ----------
FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- runtime ----------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PATH=/data/app.db
RUN groupadd --system app && useradd --system --gid app app \
  && mkdir -p /data && chown app:app /data
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
USER app
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "server.js"]
