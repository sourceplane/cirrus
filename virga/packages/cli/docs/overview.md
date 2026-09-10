# cli

`virga` — the owner's console is a terminal. Speaks the owner contract
(`/v1/owner/*`, bearer token) and nothing else; zero runtime dependencies;
bundled with esbuild to `dist/cli.js`. The contract is
`specs/components/05-cli.md`.

```bash
export VIRGA_API_URL=https://virga-site-api-prod.<subdomain>.workers.dev
export VIRGA_OWNER_TOKEN=…            # the site-api OWNER_TOKEN secret
virga stats
virga subscribers export > subscribers.csv
virga issues create --slug 2026-09 --subject "September" --html issue.html
virga issues send iss_… --yes
```

## Depends on

- **contracts**

## Depended on by

- (none)
