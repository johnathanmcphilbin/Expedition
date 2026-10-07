<script lang="ts">
	// Hack Club's justification fields, edited by a reviewer. defaultValue so a
	// re-render never wipes what's being typed. Field names and
	// labels come from the server (JUSTIFICATION_FIELDS in airtable.ts).
	let {
		fields,
		values
	}: {
		fields: { input: string; name: string; label: string; rows: number }[];
		values: Record<string, string | null>;
	} = $props();
</script>

{#each fields as f (f.name)}
	<div class="field">
		<label for={f.input}>{f.label}</label>
		{#if f.rows === 1}
			<input id={f.input} name={f.input} type="text" maxlength="5000" defaultValue={values[f.name] ?? ''} />
		{:else}
			<textarea id={f.input} name={f.input} rows={f.rows} maxlength="5000" defaultValue={values[f.name] ?? ''}></textarea>
		{/if}
	</div>
{/each}
