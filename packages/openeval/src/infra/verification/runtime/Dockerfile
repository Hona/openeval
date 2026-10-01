FROM mcr.microsoft.com/playwright:v1.63.0-noble
COPY --from=oven/bun:1.4.2 /usr/local/bin/bun /usr/local/bin/bun
RUN apt-get update && apt-get install -y --no-install-recommends git ripgrep python3 g++ make tar coreutils \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/verify
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts \
    && useradd --create-home --uid 10001 verify \
    && mkdir -p /workspace /verification \
    && chown verify:verify /workspace \
    && git config --system --add safe.directory '*'
ENV HOME=/tmp/home
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV NODE_PATH=/opt/verify/node_modules
WORKDIR /workspace
USER 10001:10001
ENTRYPOINT []
CMD ["sleep", "infinity"]
