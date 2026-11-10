<script lang="ts">
	import '$lib/styles/app.css';
	import Dublin from '$lib/components/Dublin.svelte';
	import OceanCrossing from '$lib/components/OceanCrossing.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { COUNTIES } from '$lib/ireland';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const failed = $derived(form && !form.ok ? form : null);
	const done = $derived(form && form.ok ? form : null);

	function kept(key: 'name' | 'email' | 'age' | 'school' | 'county' | 'github' | 'built' | 'built_url'): string {
		if (!failed || !(key in failed)) return '';
		const value = failed[key];
		return typeof value === 'string' ? value : '';
	}
</script>

<svelte:head>
	<title>Ireland sign-up · Expedition</title>
</svelte:head>

<main>
	<Dublin>
		<div class="signup-card">
			<p class="kicker">Students in Ireland</p>
			<p class="spots">
				{data.ireland.capacity} spots for students in Ireland.
				{#if !data.ireland.open}
					Sign-ups open soon.
				{:else if data.ireland.acceptingWaitlist}
					Those spots are full. You can still sign up and we’ll put you on the waitlist.
				{:else}
					{data.ireland.spotsLeft} still open.
				{/if}
			</p>

			{#if done}
				<p class="thanks">
					{#if done.kind === 'notify'}
						Got it. We’ll email you when sign-ups open.
					{:else if done.kind === 'waitlist'}
						You’re on the waitlist. We’ll email you if a spot opens.
					{:else}
						You’re signed up. We’ll email you about your place.
					{/if}
				</p>
				{#if done.kind !== 'notify'}
					<p class="again"><a href="/ireland">Add someone else</a></p>
				{/if}
			{:else if !data.ireland.open}
				<p class="plain">
					Leave your email if you want a heads-up when sign-ups open. Nothing else, and no other mail.
				</p>
				{#if failed && 'message' in failed && failed.message}
					<p class="error-box">{failed.message}</p>
				{/if}
				<form method="POST" action="?/notify">
					<div class="hp" aria-hidden="true">
						<label for="hp-notify">Leave this blank</label>
						<input id="hp-notify" name="hp" type="text" tabindex="-1" autocomplete="off" />
					</div>
					<div class="field">
						<label for="notify-email">Email</label>
						<input id="notify-email" name="email" type="email" required maxlength="320" autocomplete="email" value={kept('email')} />
					</div>
					<button class="btn" type="submit">Email me</button>
				</form>
			{:else}
				<p class="plain">
					Name, email, age, school and county. GitHub and something you’ve built are optional. Not having them is fine.
				</p>
				<p class="plain quiet">Not in Ireland? The travel grant is further down this page.</p>
				{#if failed && 'message' in failed && failed.message}
					<p class="error-box">{failed.message}</p>
				{/if}
				<form method="POST" action="?/signup">
					<div class="hp" aria-hidden="true">
						<label for="hp">Leave this blank</label>
						<input id="hp" name="hp" type="text" tabindex="-1" autocomplete="off" />
					</div>
					<div class="field">
						<label for="name">Name</label>
						<input id="name" name="name" type="text" required minlength="2" maxlength="80" autocomplete="name" value={kept('name')} />
					</div>
					<div class="field">
						<label for="email">Email</label>
						<input id="email" name="email" type="email" required maxlength="320" autocomplete="email" value={kept('email')} />
					</div>
					<div class="field">
						<label for="age">Age</label>
						<input id="age" name="age" type="number" required min="13" max="18" inputmode="numeric" value={kept('age')} />
						<span class="hint">13 to 18.</span>
					</div>
					<div class="field">
						<label for="school">School</label>
						<input id="school" name="school" type="text" required minlength="2" maxlength="120" autocomplete="organization" value={kept('school')} />
					</div>
					<div class="field">
						<label for="county">County</label>
						<select id="county" name="county" required value={kept('county')}>
							<option value="">Choose a county</option>
							{#each COUNTIES as county (county)}
								<option value={county}>{county === 'Derry' ? 'Derry (Londonderry)' : county}</option>
							{/each}
						</select>
					</div>

					<fieldset class="optional">
						<legend>Optional</legend>
						<p class="hint">Skip both. Plenty of people show up without a GitHub account or a finished project.</p>
						<div class="field">
							<label for="github">GitHub username <span class="opt">optional</span></label>
							<input id="github" name="github" type="text" maxlength="80" autocomplete="off" placeholder="leave blank if you don’t have one" value={kept('github')} />
						</div>
						<div class="field">
							<label for="built">Something cool you’ve built <span class="opt">optional</span></label>
							<textarea id="built" name="built" maxlength="2000" placeholder="A sentence is enough. Or skip it.">{kept('built')}</textarea>
						</div>
						<div class="field">
							<label for="built_url">Link <span class="opt">optional</span></label>
							<input id="built_url" name="built_url" type="url" maxlength="2000" placeholder="https://" value={kept('built_url')} />
						</div>
					</fieldset>
					<button class="btn" type="submit">Sign up</button>
				</form>
			{/if}
		</div>
	</Dublin>
	<OceanCrossing />
</main>
<Footer />

<style>
	.signup-card {
		background: var(--white);
		border: 3px solid var(--navy);
		padding: clamp(1.2rem, 3vw, 1.8rem);
	}
	.kicker {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--navy);
	}
	.spots {
		margin-top: 0.7rem;
		font-size: 1.2rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--navy);
		max-width: 36ch;
	}
	.plain {
		margin-top: 0.8rem;
		max-width: 52ch;
		color: var(--slate);
	}
	.quiet {
		color: var(--muted);
		font-size: 0.95rem;
	}
	.thanks {
		margin-top: 1rem;
		padding: 0.9rem 1rem;
		background: var(--paper-soft);
		border-left: 5px solid var(--green);
		font-weight: 700;
		color: var(--navy);
	}
	.again {
		margin-top: 0.9rem;
	}
	.again a {
		font-weight: 800;
		color: var(--navy);
	}
	form {
		margin-top: 1.1rem;
	}
	.optional {
		border: 0;
		border-top: 2px solid var(--rule);
		margin: 0.2rem 0 1.2rem;
		padding: 0.9rem 0 0;
	}
	.optional legend {
		padding-right: 0.6rem;
		font-weight: 800;
		color: var(--navy);
	}
	.opt {
		font-weight: 600;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-size: 0.72rem;
	}
	.hp {
		position: absolute;
		left: -10000px;
		width: 1px;
		height: 1px;
		overflow: hidden;
	}
</style>
