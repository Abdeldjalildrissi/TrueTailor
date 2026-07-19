import { rmSync } from "node:fs";
import { join } from "node:path";

/** Fresh database for every e2e run. */
export default function globalSetup(): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(join(process.cwd(), "data", `e2e.db${suffix}`), { force: true });
  }
}
