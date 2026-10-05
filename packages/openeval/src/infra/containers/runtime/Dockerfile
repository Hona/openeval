FROM oven/bun:1.4.2
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git ripgrep curl unzip g++ make python3 nodejs npm tar procps \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/opencode
RUN apt-get update && apt-get install -y --no-install-recommends iptables util-linux && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN bun install --production
COPY server.mjs ./
COPY noninteractive ./noninteractive
COPY development-container /usr/local/bin/development-container
COPY egress-proxy.mjs ./
COPY model-only-network /usr/local/bin/model-only-network
RUN useradd --system --no-create-home --shell /usr/sbin/nologin egress \
    && useradd --create-home --uid 10001 dev \
    && mkdir -p /workspace /home/dev/.config/opencode /home/dev/.local/share/opencode \
    && chown -R dev:dev /workspace /home/dev \
    && git config --system --add safe.directory '*' \
    && chmod 755 /usr/local/bin/development-container /usr/local/bin/model-only-network
ENV HOME=/home/dev
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/development-container"]
CMD ["sleep", "infinity"]
