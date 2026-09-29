# CI deploy workflows — known failures

The workflow list and how the Dokploy calls work are in `CLAUDE.md` → **CI**.

**`deploy-metrics.yml` currently fails**: the first `application.one` call returns **404**, which
is Dokploy saying no application has that ID (a bad token would be 401). The GitHub side is
correct — the environment exists and the secret is set — so the stored ID is wrong. The two
likely causes: the value copied is the **project** ID rather than the application ID (Dokploy's
URL is `…/project/<projectId>/services/application/<applicationId>` — you want the last segment),
or the service was created as a Compose service, in which case the endpoints have to become
`compose.one` / `compose.update` / `compose.deploy`. Confirm with
`curl -s "$DOKPLOY_HOST/api/project.all" -H "x-api-key: $DOKPLOY_TOKEN" | jq` and re-set via
`gh secret set DOKPLOY_APPLICATION_ID --env vaquita-metrics-dev`. The workflow also has no
skip-guard for an empty ID, so it hard-fails rather than skipping.
