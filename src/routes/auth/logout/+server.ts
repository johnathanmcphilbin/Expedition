import { redirect, type RequestHandler } from '@sveltejs/kit';
import { destroySession } from '$lib/server/session';

// POST only: a GET logout can be triggered by any third-party <img> tag.
export const POST: RequestHandler = async ({ cookies }) => {
	await destroySession(cookies);
	redirect(303, '/');
};
