// Stand-in for SvelteKit's $env/dynamic/private when server code runs under Vitest.
export const env = process.env;
