import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { APP_NAME } from "@vici/shared";

const app = express();
app.use(helmet());
app.use(express.json());
app.use(pinoHttp({ redact: ["req.headers.authorization", "req.headers.cookie"] }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: APP_NAME, time: new Date().toISOString() });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`api listening on http://localhost:${port}`));