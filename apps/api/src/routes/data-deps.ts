// What the data routes need: the database reads and a clock (tests pass a fixed time).
import type { ReadStore } from "../services/read-store";

export type DataDeps = { store: ReadStore; now: () => Date };
