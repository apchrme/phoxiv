import type { RequestHandler } from './$types';

const handler: RequestHandler = async (event) => {
	return event.locals.auth.handler(event.request);
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
