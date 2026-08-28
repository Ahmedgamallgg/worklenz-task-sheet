# Production deployment

The production stack runs behind the existing Traefik instance and pulls immutable images from `registry.sevencsolutions.com`. GitHub Actions builds, scans, and then asks for approval through the `production` environment before Portainer receives the deployment webhook.

## One-time DNS

Create these DNS-only `A` records in the `sevenc.org` Cloudflare zone, all pointing to `109.123.241.93`:

| Name | Purpose |
| --- | --- |
| `tasks.sevenc.org` | Web application and API |
| `storage.tasks.sevenc.org` | MinIO object downloads |
| `portainer.sevenc.org` | HTTPS endpoint for Portainer and its webhook |

Do not send the Portainer webhook secret to the current plain-HTTP port `9000`. Route Portainer through Traefik with TLS first.

## One-time Portainer stack

1. Add a stack named `tasksheet` from the Git repository `https://github.com/Ahmedgamallgg/worklenz-task-sheet`.
2. Use reference `refs/heads/main` and Compose path `compose.production.yml`.
3. Select the existing `sevencs` registry and the external `traefik_default` network.
4. Enable GitOps updates using a webhook, **Re-pull image**, and **Force redeployment**.
5. Add these stack variables in Portainer; generate every value marked secret independently and never commit them to a `.env` file.

| Variable | Value |
| --- | --- |
| `IMAGE_TAG` | Full SHA of the first image build |
| `APP_DOMAIN` | `tasks.sevenc.org` |
| `STORAGE_DOMAIN` | `storage.tasks.sevenc.org` |
| `DB_ADMIN_USER` | `postgres` |
| `DB_ADMIN_PASSWORD` | Secret, at least 32 random characters |
| `DB_APP_USER` | `worklenz_backend` |
| `DB_APP_PASSWORD` | Secret, at least 32 random characters |
| `MINIO_ROOT_USER` | Secret, at least 24 random characters |
| `MINIO_ROOT_PASSWORD` | Secret, at least 64 random characters |
| `S3_ACCESS_KEY_ID` | Secret, at least 24 random characters |
| `S3_SECRET_ACCESS_KEY` | Secret, at least 64 random characters |
| `SESSION_SECRET` | Secret, at least 64 random characters |
| `COOKIE_SECRET` | Secret, at least 64 random characters |
| `JWT_SECRET` | Secret, at least 64 random characters |
| `ENCRYPTION_KEY` | 64 hexadecimal characters |
| `ENCRYPTION_SALT` | Secret, at least 32 random characters |

The stack does not publish application, database, or storage ports on the host. Traefik is the only ingress path. PostgreSQL and MinIO data live in named volumes, and PostgreSQL backups are retained for 30 days in `tasksheet_database_backups`.

On a new database, the current schema snapshot is installed and the 115 bundled historical migrations are recorded as its baseline. Later releases run only newly added migrations. If the PostgreSQL data volume is lost but the backup volume remains, first boot restores the newest SQL backup, recreates the restricted application role, and applies its current password.

## One-time GitHub configuration

Add these repository Actions secrets so the build job can publish images:

- `REGISTRY_USERNAME`: dedicated push-capable registry user.
- `REGISTRY_PASSWORD`: token or password for that registry user.


Create a `production` environment restricted to the `main` branch and require a reviewer. Add one environment secret:

- `PORTAINER_WEBHOOK_URL`: the HTTPS stack webhook URL, without query parameters.

For the first deployment, create the GitHub environment and registry secrets, then push this change. Leave the deploy job waiting for production approval while the SHA-tagged images build. Create the Portainer stack with that full commit SHA, copy its HTTPS webhook into `PORTAINER_WEBHOOK_URL`, and only then approve the waiting job.

The workflow is `.github/workflows/deploy-production.yml`. A push to `main` builds and pushes all three SHA-tagged images, blocks on critical fixed vulnerabilities, waits for the production reviewer, updates `IMAGE_TAG` through the Portainer webhook, and verifies both production health endpoints.

## Rollback

In GitHub Actions, run **Build, scan, and deploy production** manually and enter the last known-good 40-character commit SHA in `image_tag`. The workflow skips rebuilding, waits for production approval, tells Portainer to restore that immutable image set, and runs the same production checks.

If GitHub Actions is unavailable, call the saved Portainer stack webhook over HTTPS with `?IMAGE_TAG=<known-good-sha>`, then verify:

```bash
curl --fail https://tasks.sevenc.org/public/health
curl --fail https://tasks.sevenc.org/
```

Database rollback is intentionally separate from application rollback. Restore the latest SQL file from the `tasksheet_database_backups` volume only after taking a fresh backup and confirming that the application migration is not backward-compatible.

Google and Apple OAuth are optional. Without their provider credentials, the backend starts with local email/password authentication and does not register the unconfigured web OAuth strategy.
