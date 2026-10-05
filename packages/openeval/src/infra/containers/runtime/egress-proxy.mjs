// Model-only egress: CONNECT to allowlisted hosts on 443, with the TLS SNI required to match.
import net from "node:net";
import { lookup } from "node:dns/promises";
import { readFileSync } from "node:fs";

const MAX_HEADER = 8192;

const privateAddress = (address) => {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const lower = address.toLowerCase();
  return lower === "::" || lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe8") ||
    lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb") || lower.startsWith("ff") ||
    (lower.startsWith("::ffff:") && privateAddress(lower.slice(7)));
};

/** The server name from a complete TLS ClientHello record, or undefined when absent or malformed. */
export function clientHelloServerName(record) {
  if (record.length < 5 || record[0] !== 0x16) return undefined;
  const length = record.readUInt16BE(3);
  if (record.length < 5 + length) return undefined;
  let offset = 5;
  if (record[offset] !== 0x01) return undefined;
  offset += 4 + 2 + 32; // handshake header, version, random
  offset += 1 + record[offset]; // session id
  offset += 2 + record.readUInt16BE(offset); // cipher suites
  offset += 1 + record[offset]; // compression methods
  const end = offset + 2 + record.readUInt16BE(offset);
  offset += 2;
  while (offset + 4 <= end) {
    const type = record.readUInt16BE(offset), size = record.readUInt16BE(offset + 2);
    offset += 4;
    if (type === 0) {
      let cursor = offset + 2;
      while (cursor + 3 <= offset + size) {
        const kind = record[cursor], nameLength = record.readUInt16BE(cursor + 1);
        if (kind === 0) return record.subarray(cursor + 3, cursor + 3 + nameLength).toString("ascii").toLowerCase();
        cursor += 3 + nameLength;
      }
      return undefined;
    }
    offset += size;
  }
  return undefined;
}

const refuse = (socket, status) => socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);

export function startProxy({ allow, port = 3128, host = "127.0.0.1", resolve = (name) => lookup(name, { all: true }) }) {
  const server = net.createServer((client) => {
    let buffer = Buffer.alloc(0);
    client.setTimeout(30_000, () => client.destroy());
    const onHeader = async (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const end = buffer.indexOf("\r\n\r\n");
      if (end < 0) {
        if (buffer.length > MAX_HEADER) refuse(client, "431 Request Header Fields Too Large");
        return;
      }
      client.off("data", onHeader);
      const [method, target] = buffer.subarray(0, end).toString("latin1").split("\r\n")[0].split(" ");
      let rest = buffer.subarray(end + 4);
      const match = /^([a-z0-9.-]+):(\d+)$/i.exec(target ?? "");
      const name = match?.[1].toLowerCase();
      if (method !== "CONNECT" || !match || match[2] !== "443" || !allow.has(name)) return refuse(client, "403 Forbidden");
      let addresses;
      try { addresses = await resolve(name); } catch { return refuse(client, "502 Bad Gateway"); }
      const usable = addresses.filter((entry) => !privateAddress(entry.address));
      if (!usable.length || usable.length !== addresses.length) return refuse(client, "403 Forbidden");
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      // Hold the tunnel until the first TLS record names the same host.
      const onHello = (data) => {
        rest = Buffer.concat([rest, data]);
        if (rest.length >= 5 && rest[0] !== 0x16) return client.destroy();
        if (rest.length < 5 || rest.length < 5 + rest.readUInt16BE(3)) {
          if (rest.length > 16_384 + 5) client.destroy();
          return;
        }
        client.off("data", onHello);
        if (clientHelloServerName(rest) !== name) return client.destroy();
        const upstream = net.connect({ host: usable[0].address, port: 443 }, () => {
          upstream.write(rest);
          client.pipe(upstream).pipe(client);
        });
        upstream.on("error", () => client.destroy());
        client.on("error", () => upstream.destroy());
        client.on("close", () => upstream.destroy());
      };
      client.on("data", onHello);
      if (rest.length) onHello(Buffer.alloc(0));
    };
    client.on("data", onHeader);
    client.on("error", () => {});
  });
  server.listen(port, host);
  return server;
}

if (import.meta.main)
  startProxy({ allow: new Set(readFileSync(process.argv[2] ?? "/etc/openeval/egress-allow", "utf8").split("\n").map((host) => host.trim()).filter(Boolean)) });
