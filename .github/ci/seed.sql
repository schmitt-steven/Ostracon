-- Rows as a user of the last release has them. Only use columns that release already had.

INSERT INTO notes (id, slug, title, content_md, tags, pinned_at) VALUES
  ('00000000-0000-0000-0000-000000000001', 'welcome', 'Welcome', 'See [[reading-list]].', '{inbox}', now()),
  ('00000000-0000-0000-0000-000000000002', 'reading-list', 'Reading list', '- Dune', '{books,books/scifi}', NULL),
  ('00000000-0000-0000-0000-000000000003', 'untagged', 'Untagged', 'No tags here.', '{}', NULL);

INSERT INTO links (from_id, to_id) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');

INSERT INTO sessions (expires_at, created_ip, label) VALUES
  (now() + interval '30 days', '127.0.0.1', 'CI');

INSERT INTO app_password (id, hash) VALUES ('current', 'not-a-real-hash');

INSERT INTO ai_settings (provider_id, model) VALUES ('gemini', 'gemini-2.5-flash');

INSERT INTO login_attempts (ip, failed_count) VALUES ('10.0.0.1', 2);
