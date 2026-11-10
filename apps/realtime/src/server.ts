import { createServer } from "node:http";
import { config } from "dotenv";
import { Server } from "socket.io";
import { realtimeEnv } from "@duel/domain/env";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });
const result = realtimeEnv.safeParse(process.env);
if (!result.success) {
  console.error(
    "Invalid realtime configuration:",
    result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
  );
  process.exit(1);
}
const env = result.data;
const http = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ status: "ok", service: "realtime", gameplay: "not-implemented" }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const io = new Server(http, {
  cors: { origin: env.WEB_ORIGIN, methods: ["GET", "POST"] },
  allowRequest: (request, callback) => callback(null, request.headers.origin === env.WEB_ORIGIN),
  maxHttpBufferSize: 16_384,
  serveClient: false,
});
// No gameplay handlers are exposed before room authorization is implemented.
io.use((_socket, next) => next(new Error("Duels are not available yet")));
http.listen(env.REALTIME_PORT, "127.0.0.1", () => {
  console.log(`Realtime health endpoint: http://localhost:${env.REALTIME_PORT}/health`);
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    io.close();
    http.close();
    setTimeout(() => process.exit(1), 5_000).unref();
  });
}
