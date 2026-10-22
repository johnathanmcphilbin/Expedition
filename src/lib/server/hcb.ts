/**
 * The program's HCB account (transparent, so its public API needs no key):
 * the live balance and every transaction, sorted into what it's for.
 * Cached for a few minutes so the admin page doesn't hit HCB on every load.
 */
const ORG = 'ysws-expedition';
const API = `https://hcb.hackclub.com/api/v3/organizations/${ORG}`;
export const HCB_URL = `https://hcb.hackclub.com/${ORG}`;

type Txn = { amount_cents: number; memo: string; date: string; type: string; pending: boolean };

export type HcbSummary = {
	balance: number;
	/** from HQ (Max Wofford) for approved hours: Payouts Clearinghouse / Hack Club HQ transfers */
	fromHq: number;
	fines: number;
	/** card grants out, less grants returned, plus reimbursements (e.g. visa fees) */
	toParticipants: number;
	/** card charges: things bought for the program */
	cardSpend: number;
	/** anything else (budget transfers in and out), net */
	other: number;
	checkedAt: string;
};

let cache: { at: number; value: HcbSummary } | null = null;
const r2 = (n: number) => Math.round(n * 100) / 100;

async function get<T>(url: string): Promise<T> {
	const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
	if (!res.ok) throw new Error(`HCB answered ${res.status}`);
	return (await res.json()) as T;
}

export async function hcbSummary(): Promise<HcbSummary> {
	if (cache && Date.now() - cache.at < 5 * 60 * 1000) return cache.value;

	const org = await get<{ balances: { balance_cents: number } }>(API);
	const txns: Txn[] = [];
	for (let page = 1; page <= 20; page++) {
		const batch = await get<Txn[]>(`${API}/transactions?per_page=100&page=${page}`);
		txns.push(...batch);
		if (batch.length < 100) break;
	}

	const sum = { fromHq: 0, fines: 0, toParticipants: 0, cardSpend: 0, other: 0 };
	for (const t of txns) {
		const usd = t.amount_cents / 100;
		if (usd > 0 && /payouts clearinghouse|hack club hq/i.test(t.memo)) sum.fromHq += usd;
		else if (/fines/i.test(t.memo)) sum.fines -= usd;
		else if (t.type === 'card_grant' || t.type === 'reimbursed_expense' || /grant/i.test(t.memo)) sum.toParticipants -= usd;
		else if (t.type === 'card_charge') sum.cardSpend -= usd;
		else sum.other += usd;
	}
	const value: HcbSummary = {
		balance: r2(org.balances.balance_cents / 100),
		fromHq: r2(sum.fromHq),
		fines: r2(sum.fines),
		toParticipants: r2(sum.toParticipants),
		cardSpend: r2(sum.cardSpend),
		other: r2(sum.other),
		checkedAt: new Date().toISOString()
	};
	cache = { at: Date.now(), value };
	return value;
}
