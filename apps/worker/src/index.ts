import { APP_NAME } from "@vici/shared";

console.log(`${APP_NAME} worker started`);
setInterval(() => console.log("worker alive", new Date().toISOString()), 60_000);