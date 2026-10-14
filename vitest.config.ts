import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Unit tests run anywhere. Integration tests (tests/*.integration.test.ts)
// talk to a real database and only run with RUN_DB_TESTS=1; point
// SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY at a test project for those.
export default defineConfig({
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
			'$env/dynamic/private': fileURLToPath(new URL('./tests/env-shim.ts', import.meta.url))
		}
	},
	test: {
		include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
		testTimeout: 30000,
		hookTimeout: 60000,
		fileParallelism: false
	}
});
