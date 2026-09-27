import { toast } from 'svelte-sonner';
import type { SubmitFunction } from '@sveltejs/kit';

/*
 * Client side of enhanced forms. Assumes the `{ action, success, error }` result
 * shape from `$lib/server/forms.ts`; change both together.
 */

/** The loosely-typed view of an action result these helpers work against. */
export type FormEnvelope = {
	action?: string;
	success?: boolean;
	error?: string;
} & Record<string, unknown>;

export type TrackOptions = {
	/** Clear inputs on success. Defaults to `false` so editor values survive a save. */
	reset?: boolean;
	/** Re-run load functions afterwards. Defaults to SvelteKit's behaviour. */
	invalidateAll?: boolean;
	/**
	 * Return a message to block the submission and toast it; `null` to allow.
	 * Not for confirmations: use `ConfirmSubmit`, which asks before submitting.
	 */
	guard?: () => string | null;
	/** Runs once the response is in, before the page data updates. */
	onDone?: () => void;
};

/**
 * Tracks in-flight submissions so buttons can disable themselves. Create one
 * per form-owning component and pass that same instance down: `has()` only sees
 * what this instance's `track()` wrote. Keys separate independent buttons.
 */
export class Pending {
	#busy = $state<Record<string, boolean>>({});

	/** True while the submission under `key` is in flight. */
	has(key = ''): boolean {
		return this.#busy[key] === true;
	}

	/** True while any submission from this component is in flight. */
	get any(): boolean {
		return Object.values(this.#busy).some(Boolean);
	}

	/**
	 * A `use:enhance` value that sets {@link has} during the request. `use:enhance`
	 * captures it once at mount, so pass a reactive key as a getter; a plain
	 * string would stay at its mount-time value.
	 */
	track(key?: string | (() => string), options: TrackOptions = {}): SubmitFunction {
		return ({ cancel }) => {
			if (options.guard) {
				const message = options.guard();
				if (message) {
					toast.error(message);
					cancel();
					return;
				}
			}

			const resolved = (typeof key === 'function' ? key() : key) ?? '';
			this.#busy[resolved] = true;

			return async ({ update }) => {
				this.#busy[resolved] = false;
				options.onDone?.();
				await update({ reset: options.reset ?? false, invalidateAll: options.invalidateAll });
			};
		};
	}
}

/**
 * Shows toasts for form results. Call it exactly once, in the component that
 * owns `form`, at the top level of its `<script>`; a second call toasts twice.
 *
 * Failures toast `form.error`. Successes look up `form.action` in `success`: a
 * string is shown as-is; a function can do cleanup and return a message (or
 * nothing).
 *
 * @param form a getter, so the effect tracks the prop rather than a snapshot
 */
export function formToasts(
	form: () => FormEnvelope | null | undefined,
	success: Record<string, string | ((form: FormEnvelope) => string | void)> = {}
): void {
	// Not $state, or writing it would re-run the effect. Compared by identity, so
	// two identical results still each toast (each response is a new object).
	let lastSeen: unknown;

	$effect(() => {
		const result = form();
		if (!result || result === lastSeen) return;
		lastSeen = result;

		if (result.success === false) {
			toast.error(result.error ?? 'Something went wrong');
			return;
		}
		if (result.success !== true) return;

		const handler = result.action ? success[result.action] : undefined;
		if (typeof handler === 'function') {
			const message = handler(result);
			if (message) toast.success(message);
		} else if (handler) {
			toast.success(handler);
		}
	});
}
