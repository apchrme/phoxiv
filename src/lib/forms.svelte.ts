import { toast } from 'svelte-sonner';
import type { SubmitFunction } from '@sveltejs/kit';

/**
 * Client-side plumbing for progressively-enhanced forms.
 *
 * Both halves here assume the action-result envelope defined in
 * `$lib/server/forms.ts` — `{ action, success, error }` — so the two files change
 * together.
 */

/** The loosely-typed view of an action result these helpers work against. */
export type FormEnvelope = {
	action?: string;
	success?: boolean;
	error?: string;
} & Record<string, unknown>;

export type TrackOptions = {
	/** Clear the form's inputs on success. Defaults to `false`: the contribute
	 *  editors are long-lived forms whose values must survive a save. */
	reset?: boolean;
	/** Re-run load functions afterwards. Defaults to SvelteKit's own behaviour. */
	invalidateAll?: boolean;
	/** Ask for confirmation before submitting; declining cancels. */
	confirm?: string | (() => string);
	/** Return a message to block the submission and toast it; `null` to allow. */
	guard?: () => string | null;
	/** Runs once the response is in, before the page data updates. */
	onDone?: () => void;
};

/**
 * Tracks which submissions are in flight, so buttons can disable themselves.
 *
 * One instance per component that owns forms. The optional key lets a single
 * component drive several independent buttons; components split down to one form
 * each can omit it entirely.
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
	 * A drop-in `use:enhance` value that flips {@link has} around the request.
	 *
	 * `use:enhance` captures this callback once when the form element mounts, so a
	 * key that depends on reactive state must be passed as a getter — a plain
	 * string would freeze at its mount-time value and the busy flag would be
	 * written under one key and read under another.
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

			if (options.confirm) {
				const prompt = typeof options.confirm === 'function' ? options.confirm() : options.confirm;
				if (!window.confirm(prompt)) {
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
 * Wires a page's form results up to toasts. Call once, at the top level of a
 * component's `<script>`.
 *
 * Failures always toast `form.error`. Successes look up `form.action` in
 * `success`: a string is toasted as-is, while a function may also do local
 * cleanup and return the message to show (or nothing, to stay silent).
 *
 * @param form a getter, so the effect tracks the prop rather than a snapshot
 */
export function formToasts(
	form: () => FormEnvelope | null | undefined,
	success: Record<string, string | ((form: FormEnvelope) => string | void)> = {}
): void {
	// Deliberately not $state: this is bookkeeping about what has already been
	// shown, and making it reactive would re-run the effect that writes it.
	// Comparing identity means two submissions with the same outcome still toast
	// twice, because each response is a fresh object.
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
