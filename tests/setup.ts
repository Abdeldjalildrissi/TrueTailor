import { beforeEach } from "vitest";
import { setProviderForTesting } from "@/lib/ai";
import { openTestDb, setDbForTesting } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import {
  importUserLimiter,
  loginEmailLimiter,
  loginIpLimiter,
  registerIpLimiter
} from "@/lib/http/rate-limit";

process.env.APP_URL = "http://localhost:3000";
process.env.DATABASE_PATH = ":memory:";

beforeEach(async () => {
  resetEnvCache();
  setDbForTesting(await openTestDb());
  setProviderForTesting(null);
  loginIpLimiter.clear();
  loginEmailLimiter.clear();
  registerIpLimiter.clear();
  importUserLimiter.clear();
});
