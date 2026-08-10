# Running and deploying this

## 1. Create `.env.local` (once)

Only one value has to be set: the Supabase **service-role key**. It unlocks the
staff, manager and head-office surfaces, and you want it set for public booking
too — see the note in §3, which is less obvious than it looks. The two public
values have defaults compiled into `src/lib/supabase/config.ts`, so those need no
setting.

In PowerShell, from this folder — paste your `sb_secret_...` key in place of the
placeholder:

```powershell
"SUPABASE_SERVICE_ROLE_KEY=sb_secret_PASTE_YOURS_HERE" | Out-File -Encoding utf8 .env.local
```

`.env.local` is gitignored. Nothing else in this repo contains a secret, and
nothing should.

## 2. Run it (2 minutes)

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000. To demo from your phone on the same wifi:

```bash
pnpm dev -- -H 0.0.0.0
```

then browse to `http://<your-laptop-ip>:3000` from the phone.

## 3. Deploy it (about 3 minutes)

I could not deploy this for you. The Vercel connection available to me does not
have permission to create projects on your account — neither your personal scope
nor the `dan2108's projects` team. That is an account-level permission and has
to come from your side.

From this folder:

```bash
npx vercel login
npx vercel link          # accept the defaults; create a new project
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
#   paste the same sb_secret_... key when prompted
npx vercel --prod
```

That prints a live URL.

**Do the `env add` step before `--prod`.** The staff, manager and head-office
pages cannot read appointments or client records without it — they show an
explanatory notice rather than an error, which *is* the tenancy model working.

**Public booking is the subtle one. Set the key for that too.** Against the
current live demo project it happens to work without it, because `reserve()` was
granted to the public role there outside the migrations. Against a database built
from `supabase/migrations/` it does **not**: 0004 revokes that grant, so the
booking page renders, offers real slots, and then fails at the confirm tap with
"Something went wrong on our side."

That difference is unresolved drift (see `docs/ARCHITECTURE.md` gap 2), so do not
rely on which side of it you are standing on. With the key set, both behave the
same and public booking works either way.

## 4. Rotate the key when the demo is done

The service-role key was pasted into a chat, so treat it as exposed. It grants
full read/write on the database and bypasses every Row-Level Security policy.

Supabase dashboard → Project Settings → API Keys → Secret keys → rotate. Then
update `.env.local` and `vercel env`. Takes a minute; no reason not to.

## Before the meeting

Reset the demo data so today looks busy — everything is generated relative to
`now()`, so a stale seed shows a half-empty day:

```sql
select seed_demo_data();
```

in the Supabase SQL editor. Then follow `docs/DEMO.md`.
