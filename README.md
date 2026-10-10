# Please find the main setup tutorial in https://github.com/chrislee3405/persona_stand_ec2yml

# current version 1.1.0

## Local setup and configuration

Keep this repository beside `persona_stand_back`. Copy `.env.example` to `.env`
and set `VITE_CDN_BASE` to your HTTPS media base URL, without a trailing slash.
This value is public and compiled into the bundle; provider keys and database
credentials belong only in the backend environment. There is no `VITE_API_URL`:
Vite and nginx proxy relative `/api/` requests to the backend.

```sh
npm ci
npm run dev
```

Run the backend's full Docker stack first, then open `http://localhost:5173` for
frontend hot reload, or `http://localhost` for the built nginx site. Local AI
credentials, automatic seeding and provider/model selection are covered in
[Part B](https://github.com/chrislee3405/persona_stand_ec2yml/blob/main/Part_B.md).
The public clone contains no personal site content; load approved private seeds
through the backend instructions. After changing `VITE_CDN_BASE`, restart Vite
or rebuild the frontend image. Runtime EC2 environment changes cannot alter the
already-built frontend bundle.

## Automated tests

See [TESTING.md](TESTING.md) for beginner instructions, test files, and the
GitHub workflow. Run `npm ci` then `npm test` with Node.js 22+.

Every push and pull request runs frontend checks with simulated API responses.
Every successful branch push publishes a commit-specific GHCR image. Combined
browser testing and selection of the frontend/backend pair belong to
`persona_stand_ec2yml`. Approved major releases copy tested images unchanged to ECR; EC2 deploys only promoted ECR digests. Minor updates remain in GHCR.

## Shared release marker

For each release candidate, put the same `RELEASE_VERSION` in the frontend,
backend and ec2yml repositories (initially `1.1.0-rc.1`). Commit and push both
applications, even if one changes only its marker. Independent tests must pass
before publication. Images carry version/source/revision labels and both
`sha-FULL_COMMIT` and `release-MARKER` tags. Publication jobs are serialized;
a marker cannot be reused for a different commit. Use `.2`, `.3`, etc. for new
candidate builds; same-commit reruns reuse the original image.

Push the matching marker and version log to ec2yml main. Its workflow waits up
to 30 minutes for both matching images and resolves their digests/revisions
without copying values or falling back to an older tag. CI installs dependencies
and validates the selection. Approval, unchanged ECR promotion and digest-based
EC2 deployment still follow Part C.0 in ec2yml. The candidate suffix does not
change the public app version stored in the database.
