# 14 — Encrypted backups (age) and the restore test

`stack/backup.sh` runs nightly (cron installed by `scripts/deploy.sh`, `17 3 * * *`) and ships
what Supabase does not already hold to the private `openwa-backups` bucket in R2 (object storage
setup and runbook: `docs/11-media-storage.md`, bucket keys in `pass cloudflare/r2/openwa-vm`):

| File                       | Contents                                                                  |
| -------------------------- | ------------------------------------------------------------------------- |
| `openwa-data-<ts>.tar.gz`  | `/app/data` minus caches: `main.sqlite` (API keys + audit), **WhatsApp auth state** (sessions/), `.api-key`, `.env.generated`, plugins |
| `openwa-db-<ts>.dump`      | `pg_dump` of the `openwa` schema only (portable copy; Supabase's own backups cover the rest) |

**Why encryption is mandatory (WF-031).** The data archive contains the WhatsApp session auth
state: account-takeover material. R2 is outside our trust boundary, so nothing may leave the VM
in plaintext. Since WF-031 `stack/backup.sh` **refuses to run** without `BACKUP_AGE_RECIPIENT`
(an `age` public key) in `stack/.env` — it exits non-zero before creating anything, so the cron
run fails loudly instead of silently uploading an unencrypted archive. There is deliberately no
plaintext fallback.

## 1. Key generation (owner, once)

Run on the VM or any trusted workstation (`age`/`age-keygen`: `apt-get install age`, or
[binary release](https://github.com/FiloSottile/age/releases)):

```bash
age-keygen -o /tmp/openwa-age-identity.txt
cat /tmp/openwa-age-identity.txt        # note the "Public key: age1..." line
shred -u /tmp/openwa-age-identity.txt   # after step 2 below
```

**Where the two halves live** (names only — the values never go into git, issues or docs):

- **Identity (secret, starts `AGE-SECRET-KEY-`)** → the pass store, entry `backups/age/openwa-vm`
  (same convention as the R2 keys in `pass cloudflare/r2/openwa-vm`). Do not decrypt-print it;
  `pass show` straight into the restore command in step 4.
- **Public key (`age1...`)** → `stack/.env` on the VM as `BACKUP_AGE_RECIPIENT`, and into
  `stack/.env.example` comment only by hand if needed to remember it exists. It is safe to keep
  anywhere; treat the identity as the only credential that can read the backups.

> **Losing the identity loses the backups.** R2 has no lifecycle expiry (owner rule: keep all
> data), so nothing can re-derive old archives without it. The identity is the escrow copy —
> it lives in pass, which auto-commits and pushes to a private remote.

## 2. Enable on the VM (owner step)

```bash
# NEXT-ACTION (owner, VM): add to /opt/wa/stack/.env  (fleet value below is the PUBLIC key only)
echo 'BACKUP_AGE_RECIPIENT=age1...' >> /opt/wa/stack/.env   # paste the real age1... from step 1
/opt/wa/stack/backup.sh         # first encrypted backup, same command the cron runs
tail -n 20 /opt/wa/backups/backup.log
```

**Verify** the log shows `encrypting with age` and the local copies are `.age` files, and that
the header of an encrypted archive is the age header, not a gzip/tar/SQLite id:

```bash
head -c 16 /opt/wa/backups/openwa-data-<ts>.tar.gz.age   # --> "age-encryption.o"
```

## 3. Monthly restore test (owner step, the WF-031 deliverable)

Every month (OKR O2 key result): prove one archive still decrypts and opens. Same VM, scratch
directory, never touching the live volume:

```bash
# NEXT-ACTION (owner, VM): download one archive with the same rclone config backup.sh uses
TS=$(ls /opt/wa/backups | grep -o 'openwa-data-.*\.tar.gz\.age' | sort -r | head -1 | sed 's/openwa-data-//;s/\.tar\.gz\.age//')
set -a; . /opt/wa/stack/.env; set +a
export RCLONE_CONFIG_STORE_TYPE=s3 RCLONE_CONFIG_STORE_PROVIDER="${S3_PROVIDER:-Other}" \
  RCLONE_CONFIG_STORE_FORCE_PATH_STYLE="${S3_FORCE_PATH_STYLE:-true}" \
  RCLONE_CONFIG_STORE_NO_CHECK_BUCKET=true \
  RCLONE_CONFIG_STORE_ENDPOINT="$S3_ENDPOINT" RCLONE_CONFIG_STORE_REGION="${S3_REGION:-auto}" \
  RCLONE_CONFIG_STORE_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY"
mkdir -p /tmp/restore-test && chmod 700 /tmp/restore-test
docker run --rm -v /tmp/restore-test:/backup -e RCLONE_CONFIG_STORE_TYPE -e RCLONE_CONFIG_STORE_PROVIDER \
  -e RCLONE_CONFIG_STORE_FORCE_PATH_STYLE -e RCLONE_CONFIG_STORE_NO_CHECK_BUCKET \
  -e RCLONE_CONFIG_STORE_ENDPOINT -e RCLONE_CONFIG_STORE_REGION \
  -e RCLONE_CONFIG_STORE_ACCESS_KEY_ID -e RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY \
  rclone/rclone:latest copy "store:${BACKUP_BUCKET:-openwa-backups}/$(hostname)/" /backup \
  --include "*-$TS.*"

# decrypt straight from pass (identity never touches disk as a file)
age -d -i <(pass show backups/age/openwa-vm) \
  -o /tmp/restore-test/openwa-data-$TS.tar.gz /tmp/restore-test/openwa-data-$TS.tar.gz.age

# prove the archive is intact and the session state is inside
tar -tzf /tmp/restore-test/openwa-data-$TS.tar.gz | grep -E 'sessions/|baileys/|main\.sqlite' | head
head -c 5 /tmp/restore-test/openwa-db-$TS.dump   # pg custom format magic --> "PGDMP"
rm -rf /tmp/restore-test
```

Expected for the monthly test: tar listing shows the session/auth-state paths and the dump starts
with `PGDMP`. A full point-in-time rebuild (fresh VM, restore into a scratch Postgres, re-point
`DATABASE_URL`) is the annual drill — same pass identity, same steps, but record it.

## 4. Rotation (owner step, only if the key is suspected or a teammate must be dropped)

`age` takes one recipient per archive here, so rotation = swap the recipient **after** backing up
the archives made with the old one:

```bash
# NEXT-ACTION (owner, VM + pass):
# 1. rename the retired identity:  pass mv backups/age/openwa-vm backups/age/openwa-vm-retired-YYYYMMDD
# 2. generate a NEW keypair (step 1), insert under backups/age/openwa-vm
# 3. swap the recipient:  BACKUP_AGE_RECIPIENT=<new age1...> in /opt/wa/stack/.env
# 4. run /opt/wa/stack/backup.sh once and re-run step 3 against the NEW archive
# 5. NEVER delete retired identities: R2 keeps every backup (no expiry), so old archives
#    stay readable only with the identities that encrypted them.
```

## 5. Failure mode notes

- Unset/garbage recipient → the nightly cron fails with the ERROR lines above; the signal is the
  cron log `/opt/wa/backups/backup.log` (nothing is uploaded, no plaintext fallback).
- `age` failing mid-encrypt aborts before upload (`set -e`); plaintext stays in
  `/opt/wa/backups` on the VM until pruned — fix the cause (usually a mistyped
  `BACKUP_AGE_RECIPIENT`), run the backup again, then delete the unencrypted leftovers by hand.
- The same `stack/preflight.sh` gates decide object-store reachability: with the R2 keys unset
  the backup still runs and encrypts, but archives stay on the VM
  (`WARNING: no object-store keys ... backup kept on the VM only`).
