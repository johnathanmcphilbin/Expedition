// @ts-nocheck
/**
 * Orchard runs this image as an HTTP app. There is no command override.
 * MIGRATE_COMMAND, when set, runs once; the process then stays up on $PORT.
 * A non-zero exit (including initial-load refusing a non-empty database) is
 * reported on GET /status and does not stop the server.
 */
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const PORT = Number(process.env.PORT || 3000);
const STATE = process.env.MIGRATE_STATE_DIR || '/tmp/expedition-migrate';
const ROOT = existsSync('/app/package.json') ? '/app' : process.cwd();

const COMMANDS = new Set([
	'initial-load',
	'post-load',
	'verify',
	'copy-storage',
	'backup',
	'restore',
	'readonly-role',
	'roles',
	'manifest-emit',
	'manifest-check',
	'test',
	'decommission'
]);

const DESTRUCTIVE = new Set(['decommission', 'restore']);

function redact(text) {
	return text
		.replace(/\b((?:postgres|postgresql):\/\/)([^:\s/@]*:)[^@\s]+@/gi, '$1$2REDACTED@')
		.replace(/\b(password|passwd|pwd|secret|token|apikey|api_key)=([^\s&]+)/gi, '$1=REDACTED')
		.replace(/\b(PGPASSWORD|SOURCE_DATABASE_URL|DATABASE_URL|TARGET_DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY|PGRST_JWT_SECRET|POSTGREST_JWT_SECRET)=([^\s]+)/g, '$1=REDACTED');
}

function extraArgs() {
	return (process.env.MIGRATE_ARGS || '').split(/\s+/).filter(Boolean);
}

function commandLine(command, args) {
	switch (command) {
		case 'verify':
			return ['node', ['scripts/migrate/verify.mjs', ...args]];
		case 'copy-storage':
			return ['node', ['scripts/migrate/copy-storage.mjs', ...args]];
		case 'backup':
			return ['node', ['scripts/migrate/backup-source.mjs', ...args]];
		case 'restore':
			return ['node', ['scripts/migrate/restore-target.mjs', ...args]];
		case 'initial-load':
			return ['node', ['scripts/migrate/initial-load.mjs', ...args]];
		case 'post-load':
			return ['node', ['scripts/migrate/post-load.mjs', ...args]];
		case 'manifest-emit':
			return ['node', ['scripts/migrate/manifest.mjs', 'emit', ...args]];
		case 'manifest-check':
			return ['node', ['scripts/migrate/manifest.mjs', 'check', ...args]];
		case 'readonly-role':
			return ['node', ['scripts/migrate/readonly-role.mjs', ...args]];
		case 'roles': {
			const psqlArgs = [process.env.DATABASE_URL || '', '-v', 'ON_ERROR_STOP=1', '-f', 'deploy/postgrest/roles.sql'];
			if (process.env.AUTHENTICATOR_PASSWORD) {
				psqlArgs.splice(1, 0, '-v', `authenticator_password=${process.env.AUTHENTICATOR_PASSWORD}`);
			}
			return ['psql', [...psqlArgs, ...args]];
		}
		case 'test':
			return ['node', ['scripts/migrate/run-orchard-tests.mjs', ...args]];
		case 'decommission':
			return ['sh', ['deploy/migrate/decommission-prep.sh', ...args]];
		default:
			return null;
	}
}

function run(bin, args, env = process.env) {
	return new Promise((resolve) => {
		const child = spawn(bin, args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
		const log = createWriteStreamSafe();
		const onData = (chunk) => {
			process.stdout.write(chunk);
			log.write(chunk);
		};
		child.stdout.on('data', onData);
		child.stderr.on('data', onData);
		child.on('error', (error) => {
			const line = `${error.message}\n`;
			process.stdout.write(line);
			log.write(line);
			resolve(127);
		});
		child.on('close', (code) => {
			log.end(() => resolve(code ?? 1));
		});
	});
}

function createWriteStreamSafe() {
	return createWriteStream(path.join(STATE, 'output.log'), { flags: 'a' });
}

async function readText(file) {
	try {
		return await readFile(path.join(STATE, file), 'utf8');
	} catch {
		return '';
	}
}

async function writeStatus({ command, finished, exitCode, note }) {
	const raw = await readText('output.log');
	const lines = redact(raw).split('\n');
	const tail = lines.slice(-300).join('\n');
	const body = [
		`command: ${command || '(none)'}`,
		`finished: ${finished || ''}`,
		`exit_code: ${exitCode === undefined || exitCode === null || exitCode === '' ? '' : exitCode}`,
		note ? `note: ${note}` : '',
		'---',
		tail
	]
		.filter((line) => line !== '')
		.join('\n');
	await writeFile(path.join(STATE, 'status.txt'), body.endsWith('\n') ? body : `${body}\n`);
}

function listen() {
	const server = http.createServer(async (req, res) => {
		const pathname = (req.url || '/').split('?')[0];
		if (req.method === 'GET' && pathname === '/health') {
			res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
			res.end('ok\n');
			return;
		}
		if (req.method === 'GET' && pathname === '/status') {
			const body = await readText('status.txt');
			res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
			res.end(body || 'command: (none)\nfinished:\nexit_code:\n');
			return;
		}
		res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
		res.end('not found\n');
	});
	server.listen(PORT, '0.0.0.0', () => {
		console.log(`migrate status server on :${PORT}  GET /health  GET /status`);
	});
}

async function main() {
	await mkdir(STATE, { recursive: true });
	const fromArgv = process.argv[2] || '';
	const command = fromArgv || process.env.MIGRATE_COMMAND || '';
	if (command && !COMMANDS.has(command)) {
		console.error(`unknown MIGRATE_COMMAND ${command}`);
		await writeStatus({
			command,
			finished: new Date().toISOString(),
			exitCode: 2,
			note: `unknown command. expected one of: ${[...COMMANDS].join(', ')}`
		});
		listen();
		return;
	}
	if (!command) {
		await writeStatus({
			command: '',
			finished: '',
			exitCode: '',
			note: 'MIGRATE_COMMAND is unset. This app is idle. Set MIGRATE_COMMAND and redeploy to run a step once.'
		});
		listen();
		return;
	}

	const previousCommand = (await readText('command')).trim();
	const previousExit = (await readText('exit_code')).trim();
	const finished = (await readText('finished')).trim();
	const force = process.env.MIGRATE_RERUN === '1';
	const already = previousCommand === command && previousExit !== '';
	const skip =
		already &&
		!force &&
		(previousExit === '0' || DESTRUCTIVE.has(command));
	if (skip) {
		const why =
			previousExit === '0'
				? 'already finished successfully; not running again. Set MIGRATE_RERUN=1 to force.'
				: 'previous run of a destructive command is kept. Set MIGRATE_RERUN=1 to force.';
		console.log(`MIGRATE_COMMAND=${command} ${why}`);
		await writeStatus({ command, finished, exitCode: previousExit, note: why });
		listen();
		return;
	}

	await writeFile(path.join(STATE, 'output.log'), '');
	await writeFile(path.join(STATE, 'command'), command);
	const spec = commandLine(command, extraArgs());
	const env = { ...process.env };
	if (command === 'test') {
		// The flow suite loads Vitest and the server modules in this child.
		// Cap the heap so a leak fails the run instead of growing without bound.
		const heap = '--max-old-space-size=110';
		env.NODE_OPTIONS = env.NODE_OPTIONS ? `${env.NODE_OPTIONS} ${heap}` : heap;
	}
	console.log(`running ${command} once`);
	const code = await run(spec[0], spec[1], env);
	const when = new Date().toISOString();
	await writeFile(path.join(STATE, 'exit_code'), String(code));
	await writeFile(path.join(STATE, 'finished'), when);
	const note =
		code === 0
			? 'finished. A restart will not run this command again unless MIGRATE_RERUN=1.'
			: 'finished with a non-zero exit. initial-load refusing a non-empty database is reported here and the process stays up. Set MIGRATE_RERUN=1 after fixing a failed first load.';
	await writeStatus({ command, finished: when, exitCode: code, note });
	console.log(`${command} exit ${code}; serving /status`);
	listen();
}

const isMain = process.argv[1] && process.argv[1].endsWith('app.mjs');
if (isMain) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}

export { redact };
