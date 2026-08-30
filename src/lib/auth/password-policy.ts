/**
 * Password length bounds, in a client-safe file so the dialog and the action
 * agree without pulling in `server-only` lib/auth/password. lib/auth/actions
 * enforces both bounds; the dialog's copy is a courtesy.
 */

export const MIN_PASSWORD_LENGTH = 10;

/** Not about work factor — just not accepting a megabyte of form body. */
export const MAX_PASSWORD_LENGTH = 256;
