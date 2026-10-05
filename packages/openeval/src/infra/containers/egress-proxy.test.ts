import { expect, test } from "bun:test";
import net from "node:net";
import tls from "node:tls";
// @ts-expect-error The runtime proxy is plain JavaScript shipped in the candidate image.
import { clientHelloServerName, startProxy } from "./runtime/egress-proxy.mjs";

/** A real ClientHello from Node's TLS client, captured by a plain TCP listener. */
async function clientHello(servername: string) {
  const captured = Promise.withResolvers<Buffer>();
  const server = net.createServer((socket) => socket.once("data", (data: Buffer) => { captured.resolve(data); socket.destroy(); }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const client = tls.connect({ host: "127.0.0.1", port: (server.address() as net.AddressInfo).port, servername });
  client.on("error", () => {});
  const record = await captured.promise;
  client.destroy();
  server.close();
  return record;
}

/** Send raw bytes to the proxy and collect what it returns until it closes the connection. */
async function exchange(port: number, ...writes: Buffer[]) {
  const socket = net.connect(port, "127.0.0.1");
  const chunks: Buffer[] = [];
  socket.on("data", (chunk: Buffer) => chunks.push(chunk));
  const closed = new Promise<void>((resolve) => socket.on("close", () => resolve()));
  socket.on("error", () => {});
  for (const data of writes) {
    socket.write(data);
    await Bun.sleep(50);
  }
  await Promise.race([closed, Bun.sleep(1000)]);
  socket.destroy();
  return Buffer.concat(chunks).toString("latin1");
}

test("reads the server name from a TLS ClientHello", async () => {
  expect(clientHelloServerName(await clientHello("opencode.ai"))).toBe("opencode.ai");
  expect(clientHelloServerName(Buffer.from("GET / HTTP/1.1\r\n\r\n"))).toBeUndefined();
});

test("the egress proxy permits only CONNECT to allowed public hosts with a matching SNI", async () => {
  const resolved: string[] = [];
  const server = startProxy({
    allow: new Set(["opencode.ai", "private.example"]),
    port: 0,
    resolve: async (name: string) => {
      resolved.push(name);
      return [{ address: name === "private.example" ? "10.0.0.8" : "203.0.113.10", family: 4 }];
    },
  });
  await new Promise((resolve) => server.once("listening", resolve));
  const port = (server.address() as net.AddressInfo).port;
  try {
    expect(await exchange(port, Buffer.from("GET http://opencode.ai/ HTTP/1.1\r\nHost: opencode.ai\r\n\r\n"))).toStartWith("HTTP/1.1 403");
    expect(await exchange(port, Buffer.from("CONNECT example.com:443 HTTP/1.1\r\n\r\n"))).toStartWith("HTTP/1.1 403");
    expect(await exchange(port, Buffer.from("CONNECT opencode.ai:80 HTTP/1.1\r\n\r\n"))).toStartWith("HTTP/1.1 403");
    expect(await exchange(port, Buffer.from("CONNECT private.example:443 HTTP/1.1\r\n\r\n"))).toStartWith("HTTP/1.1 403");
    // An allowed CONNECT whose TLS names another host is closed before any upstream connection.
    const mismatch = await exchange(port, Buffer.from("CONNECT opencode.ai:443 HTTP/1.1\r\n\r\n"), await clientHello("example.com"));
    expect(mismatch).toStartWith("HTTP/1.1 200");
    expect(mismatch.split("\r\n\r\n")[1]).toBe("");
    // Plain bytes after an allowed CONNECT are not TLS and are refused too.
    expect((await exchange(port, Buffer.from("CONNECT opencode.ai:443 HTTP/1.1\r\n\r\n"), Buffer.from("GET / HTTP/1.1\r\n\r\n"))).split("\r\n\r\n")[1]).toBe("");
    expect(resolved).not.toContain("example.com");
  } finally {
    server.close();
  }
});
