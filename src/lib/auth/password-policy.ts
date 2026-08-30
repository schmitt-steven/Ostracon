/**
 * What counts as a password, in the one place both sides can read it.
 *
 * Two numbers, and a file of their own because they are needed at both ends of
 * a boundary: the dialog decides when its button lights up, the action decides
 * what it accepts, and those two disagreeing means a form that offers a change
 * the server then refuses. Everything else about passwords lives in
 * lib/auth/password, which is `server-only` and reaches the database — importing
 * that from a client component to read an integer would pull the whole of it,
 * hashing and all, up against the bundle.
 *
 * The dialog's copy is a courtesy; lib/auth/actions enforces both bounds on the
 * way in, because a Server Action is a public endpoint whatever the UI in front
 * of it does.
 */

export const MIN_PASSWORD_LENGTH = 10;

/**
 * scrypt's cost is in its parameters rather than in the length of what it is
 * given, so this isn't about work — it is about not accepting a megabyte of
 * form body as a credential.
 */
export const MAX_PASSWORD_LENGTH = 256;
