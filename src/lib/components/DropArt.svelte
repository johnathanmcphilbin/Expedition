<!--
	Placeholder compositions for each supply drop. Rough line work rather than
	icons. To swap in real photography later, replace a branch with an <img>.
-->
<script lang="ts">
	import type { Drop } from '$lib/types';
	let { kind, tone = 'ink' }: { kind: Drop['art']; tone?: 'ink' | 'cream' } = $props();
</script>

<svg class="art art-{tone}" viewBox="0 0 220 170" aria-hidden="true">
	{#if kind === 'cap'}
		<!-- cap, side on, with stickers scattered beside it -->
		<path class="s" d="M46 104 C46 52 128 48 136 100" />
		<path class="s" d="M136 100 C176 96 198 106 196 116 C170 124 142 120 134 114" />
		<path class="s2" d="M62 96 C70 70 110 68 122 92" />
		<path class="fill-g" d="M86 70 l7 13 h-14 Z" />
		<circle class="s2" cx="46" cy="142" r="13" />
		<rect class="s2" x="86" y="132" width="24" height="24" rx="3" transform="rotate(-8 98 144)" />
		<path class="fill-g" d="M140 128 l6 12 13 2 -9 9 2 13 -12 -6 -12 6 2 -13 -9 -9 13 -2 Z" />
	{:else if kind === 'mouse'}
		<path class="s" d="M74 66 C74 34 146 34 146 66 L146 122 C146 150 74 150 74 122 Z" />
		<path class="s2" d="M110 40 L110 82" />
		<rect class="fill-g" x="104" y="52" width="12" height="22" rx="6" />
		<path class="s2" d="M86 108 C96 116 124 116 134 108" />
	{:else if kind === 'charger'}
		<rect class="s" x="60" y="44" width="76" height="76" rx="10" />
		<path class="s" d="M80 44 L80 26" /><path class="s" d="M116 44 L116 26" />
		<rect class="fill-g" x="86" y="106" width="24" height="8" rx="4" />
		<path class="s2" d="M98 120 C98 150 150 148 160 126 C168 108 196 112 196 132" />
	{:else if kind === 'earbuds'}
		<path class="s" d="M74 58 C92 46 108 60 102 80 C96 100 74 104 66 90 C60 78 62 66 74 58 Z" />
		<path class="s" d="M86 96 L80 134" />
		<path class="s" d="M140 50 C158 38 174 52 168 72 C162 92 140 96 132 82 C126 70 128 58 140 50 Z" />
		<path class="s" d="M152 88 L146 126" />
		<path class="fill-g" d="M78 138 a5 5 0 1 0 0.1 0" />
		<path class="fill-g" d="M144 130 a5 5 0 1 0 0.1 0" />
	{:else if kind === 'mic'}
		<rect class="s" x="86" y="26" width="48" height="76" rx="24" />
		<path class="s2" d="M92 44 H128 M92 56 H128 M92 68 H128 M92 80 H128" />
		<path class="s" d="M68 76 C68 112 152 112 152 76" />
		<path class="s" d="M110 112 L110 136" />
		<path class="s" d="M84 148 C84 138 136 138 136 148 Z" />
		<rect class="fill-g" x="100" y="120" width="20" height="8" rx="4" />
	{:else if kind === 'speaker'}
		<rect class="s" x="40" y="58" width="140" height="66" rx="33" />
		<circle class="s2" cx="74" cy="91" r="7" /><circle class="s2" cx="96" cy="91" r="7" />
		<circle class="s2" cx="118" cy="91" r="7" /><circle class="s2" cx="140" cy="91" r="7" />
		<rect class="fill-g" x="158" y="84" width="14" height="14" rx="7" />
		<path class="s2" d="M60 58 C56 36 88 30 92 50" />
	{:else if kind === 'camera'}
		<rect class="s" x="46" y="40" width="128" height="104" rx="12" />
		<circle class="s" cx="110" cy="86" r="30" />
		<circle class="s2" cx="110" cy="86" r="15" />
		<rect class="fill-g" x="58" y="52" width="26" height="14" rx="3" />
		<path class="s2" d="M140 52 H162" />
		<rect class="s2" x="76" y="140" width="68" height="26" rx="2" />
	{:else if kind === 'keyboard'}
		<!-- jersey behind, keyboard in front -->
		<path class="s2" d="M62 40 L84 28 C90 44 130 44 136 28 L158 40 L168 62 L154 70 L148 62 L148 132 L72 132 L72 62 L66 70 L52 62 Z" />
		<text class="num" x="110" y="106" text-anchor="middle">40</text>
		<rect class="s" x="34" y="112" width="152" height="50" rx="6" />
		{#each [0, 1, 2] as row (row)}
			{#each Array(8) as _, col (col)}
				<rect
					class="key"
					x={42 + col * 17.5}
					y={119 + row * 13}
					width="13"
					height="10"
					rx="2"
				/>
			{/each}
		{/each}
	{/if}
</svg>

<style>
	.art {
		width: 100%;
		height: auto;
		display: block;
		overflow: visible;
	}

	/* stroke weights: heavier for the object, lighter for detail */
	.art :global(.s) {
		fill: none;
		stroke: var(--navy);
		stroke-width: 4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.art :global(.s2) {
		fill: none;
		stroke: var(--navy);
		stroke-width: 2.5;
		stroke-linecap: round;
		stroke-linejoin: round;
		opacity: 0.55;
	}
	.art :global(.fill-g) {
		fill: var(--green);
		stroke: none;
	}
	.art :global(.key) {
		fill: none;
		stroke: var(--navy);
		stroke-width: 2;
		opacity: 0.5;
	}
	.art :global(.num) {
		font-family: var(--font-sans);
		font-weight: 800;
		font-size: 34px;
		fill: var(--navy);
		opacity: 0.25;
	}

	/* on navy backgrounds */
	.art-cream :global(.s),
	.art-cream :global(.s2),
	.art-cream :global(.key) {
		stroke: var(--paper);
	}
	.art-cream :global(.num) {
		fill: var(--paper);
	}
</style>
