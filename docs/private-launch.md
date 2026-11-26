# Private launch checklist

The MVP exists to answer one question: **will pairs of people on different assistants keep sharing through Orbit after the first week?** This is the list to work through before real people use a public instance, and the plan for finding out.

Tick things off in your own copy. Items marked **needs you** cannot be done from the code: they need a real account, a real person, or your judgement.

## Before anyone else signs in

**Security**

- [ ] **Needs you:** someone other than the author has reviewed `api/orbit/auth/` and `api/orbit/oauth/`. See [SECURITY.md](../SECURITY.md) for where to start.
- [ ] `ORBIT_SECRET_KEY` is long, random, stored somewhere safe, and not in the repository.
- [ ] `ORBIT_ALLOWED_EMAILS` lists only the people in the current wave. Anyone holding a valid invite can still join, so a tester's partner needs nothing from you. An invite sent to a specific email address only works for that address, and it also waits for that person under **Pending spaces** once they sign in. An invite link without an address works for anyone who holds it, so send those links privately.
- [ ] The api port is not published anywhere. Only Caddy faces the internet.
- [ ] **Needs you:** on Railway, run the `X-Real-IP` check in [deploy-railway.md](deploy-railway.md#good-to-know) and act on the result. Otherwise the per-address limits can be dodged or shared.
- [ ] **Needs you:** read the "Known limitations" in [SECURITY.md](../SECURITY.md) and decide that you accept them for a test with a handful of people.
- [ ] **Needs you:** tell testers that Orbit cannot verify who an assistant is, so the connection page shows where it will send them. Ask them to read it.

**Domain and email**

- [ ] The domain is chosen and final. Changing it forces every tester to reconnect.
- [ ] `https://<domain>/api/health` answers `{"status":"ok"}` with a valid certificate.
- [ ] SMTP works: ask for a sign-in link for a Gmail address and for a work address, and confirm both arrive in the inbox, not spam.
- [ ] SPF and DKIM are set for the domain in `EMAIL_FROM`.
- [ ] **Needs you:** open a sign-in link from a company mailbox that scans links. Confirm the **Continue to Orbit** page still lets the person in.

**Data safety**

- [ ] Nightly backups are on (`BACKUP_S3_BUCKET` and the `AWS_*` credentials), and the bucket is outside the hosting provider and private.
- [ ] `docker compose exec --user orbit api python -m orbit.backup` uploads a file.
- [ ] A backup was restored into a scratch copy and the data was there. See [self-hosting](self-hosting.md#backups).
- [ ] Error tracking is on (`SENTRY_DSN`) and a deliberate test error shows up without any shared content in it.
- [ ] An uptime check requests `/api/health` every minute and tells you when it fails.

**Policies and cost**

- [ ] `ORBIT_OPERATOR_NAME`, `ORBIT_CONTACT_EMAIL` and `ORBIT_DATA_LOCATION` are set, so the privacy page says who runs this Orbit and where the data is.
- [ ] **Needs you:** you have read the privacy and terms pages as a tester would, and changed anything that is not true of your setup. They are plain-language drafts, not legal advice.
- [ ] **Needs you:** a monthly spending cap is set on the AI key: in the Anthropic Console, or as a budget on the Google Cloud project behind a Gemini key. A Gemini key comes from a project with billing turned on, so Google does not use what members share to improve its products.

## Checks with real assistants

These are the milestone checks that only real accounts can answer. Write down what you find.

- [ ] **Needs you:** connect from Claude, ChatGPT and Grok through each one's normal "add connector" flow, signed in as a named user. Follow [Claude](connect-claude.md), [ChatGPT](connect-chatgpt.md) and [Grok](connect-grok.md).
- [ ] **Needs you:** share something from one assistant and read it from another.
- [ ] **Needs you:** record whether ChatGPT can write (share, remember, combine) on your plan. If it cannot, note which plan you tested.
- [ ] **Needs you:** with every chat and browser tab closed, change something from one account and confirm the other person gets an email.
- [ ] **Needs you:** run Combine on real shared items and judge whether the plan is good enough to act on.
- [ ] **Needs you:** take screenshots of the real connector screens and add them to the three guides.

## Release waves

1. **Wave 1:** you and one other person, for a week, using it for something real.
2. **Wave 2:** five pairs on different assistants, at least two of them work pairs, for two weeks.
3. **Wave 3:** open the waitlist gradually, only if three or more pairs are still sharing in week two.

## Measuring week two

Orbit has no analytics. Everything you need is in the database. Run these against a copy, such as a restored backup, in any SQLite tool.

Who shared what, per space and week, and through which assistant (`web` means the web page):

```sql
select
  s.id as space,
  strftime('%Y-%W', e.created_at) as week,
  count(distinct e.person) as people_sharing,
  group_concat(distinct e.via) as through
from (
  select space_id, shared_by as person, via, created_at
  from items
  where author_kind <> 'orbit' and shared_by is not null
  union all
  select space_id, set_by as person, via, created_at
  from memory
  where set_by is not null
) e
join spaces s on s.id = e.space_id and s.deleted_at is null
group by s.id, week
order by week, s.id;
```

Spaces where at least two people were still sharing in the second week after the space's first share:

```sql
with activity as (
  select space_id, shared_by as person, created_at
  from items
  where author_kind <> 'orbit' and shared_by is not null
  union all
  select space_id, set_by as person, created_at
  from memory
  where set_by is not null
),
first_share as (
  select space_id, min(created_at) as started from activity group by space_id
)
select
  f.space_id,
  f.started,
  count(distinct case
    when a.created_at >= datetime(f.started, '+7 days')
     and a.created_at < datetime(f.started, '+14 days')
    then a.person
  end) as people_sharing_in_week_two
from first_share f
join activity a on a.space_id = f.space_id
group by f.space_id, f.started
having people_sharing_in_week_two >= 2;
```

Each row is a pair, or a group, still sharing in week two. Retracted items still count as activity. People who left after deleting their account no longer appear.
