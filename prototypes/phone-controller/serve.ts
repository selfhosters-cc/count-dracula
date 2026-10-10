// PROTOTYPE — throwaway. Serves the phone-controller prototype on the LAN.
// Run: bun prototypes/phone-controller/serve.ts
const page = Bun.file(new URL("./index.html", import.meta.url));
const server = Bun.serve({
  port: 5055,
  hostname: "0.0.0.0",
  fetch: () => new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } }),
});
console.log(`Phone controller prototype: http://localhost:${server.port}/?variant=A  (also on your LAN IP)`);
