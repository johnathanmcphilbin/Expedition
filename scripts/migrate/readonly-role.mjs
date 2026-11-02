#!/usr/bin/env node
/**
 * Generate SQL that recreates role control_tower_expedition_ro with the
 * column-level SELECT grants it has on the source. The grants are read from
 * information_schema.column_privileges. Nothing is hardcoded, and nothing is
 * applied: the SQL is written for the operator to run on the TARGET.
 *
 *   node scripts/migrate/readonly-role.mjs --out backups/control_tower_expedition_ro.sql
 *
 * Environment: SOURCE_DATABASE_URL
 */
import { writeFile } from 'node:fs/promises';
import { openReadOnly, parseArgs, quoteIdent, sourceUrlFrom } from './lib.mjs';

const ROLE = 'control_tower_expedition_ro';

export async function generateReadonlyRoleSql(source) {
	const exists = await source.query('select 1 from pg_roles where rolname = $1', [ROLE]);
	if (!exists.rows.length) {
		throw new Error(`${ROLE} does not exist on the source, so there are no grants to copy`);
	}

	// The information_schema view only shows privileges for the current role.
	// Switch to the read-only role (allowed in a read-only session) so its
	// grants are visible, then switch back.
	await source.query(`set role ${quoteIdent(ROLE)}`);
	let rows;
	try {
		const result = await source.query(
			`select table_schema, table_name, column_name, privilege_type
			 from information_schema.column_privileges
			 where grantee = $1 and table_schema = 'public'
			 order by table_name, column_name, privilege_type`,
			[ROLE]
		);
		rows = result.rows;
	} finally {
		await source.query('reset role');
	}

	const other = rows.filter((row) => row.privilege_type !== 'SELECT');
	if (other.length) {
		const sample = other.slice(0, 10).map((row) => `${row.privilege_type} ${row.table_name}.${row.column_name}`);
		throw new Error(`${ROLE} has non-SELECT column privileges, which this generator will not drop silently: ${sample.join(', ')}`);
	}
	if (!rows.length) {
		throw new Error(`${ROLE} has no column SELECT privileges in information_schema.column_privileges`);
	}

	const byTable = new Map();
	for (const row of rows) {
		const columns = byTable.get(row.table_name) ?? [];
		if (!columns.includes(row.column_name)) columns.push(row.column_name);
		byTable.set(row.table_name, columns);
	}

	const grants = [...byTable.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([table, columns]) => {
			const cols = columns.map(quoteIdent).join(', ');
			return `grant select (${cols}) on table public.${quoteIdent(table)} to ${quoteIdent(ROLE)};`;
		});

	return `-- Recreate ${ROLE} on the TARGET from the source's information_schema.column_privileges.
-- Generated ${new Date().toISOString()}. Apply on the target only:
--   psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -f this-file.sql
-- Do not run this against the source.

\\set ON_ERROR_STOP on

select 'create role ${ROLE} nologin'
where not exists (select 1 from pg_roles where rolname = '${ROLE}')
\\gexec

grant usage on schema public to ${quoteIdent(ROLE)};

${grants.join('\n')}
`;
}

const isMain = process.argv[1] && process.argv[1].endsWith('readonly-role.mjs');
if (isMain) {
	const args = parseArgs(process.argv.slice(2));
	const sourceUrl = sourceUrlFrom(args);
	const out = args.out;
	if (!sourceUrl || !out || args.help) {
		console.error('Usage: node scripts/migrate/readonly-role.mjs --out <file.sql>');
		process.exit(2);
	}
	const source = await openReadOnly(sourceUrl, 'source');
	try {
		const sql = await generateReadonlyRoleSql(source);
		await writeFile(out, sql);
		console.log(`wrote ${out}`);
	} catch (error) {
		console.error(error.message || error);
		process.exit(1);
	} finally {
		await source.end();
	}
}
