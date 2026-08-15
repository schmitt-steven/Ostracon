import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const have = (await sql`select count(*)::int n from notes`)[0].n;
const ts = Date.now();
for (let i = 0; i < 10 - have; i++) {
  const title = `CNT Note ${i}`;
  await sql`insert into notes (slug, title, content_md, tags)
            values (${`cnt-${i}-${ts}`}, ${title}, ${`---\ntitle: ${title}\ntags: []\n---\n\nbody\n`}, '{}'::text[])`;
}
console.log("total notes now:", (await sql`select count(*)::int n from notes`)[0].n);
