# Please find the main setup tutorial in https://github.com/chrislee3405/persona_stand_ec2yml

# current version 0.7.1

## Automated tests

See [TESTING.md](TESTING.md) for beginner instructions, test files, and the
GitHub workflow. Run `npm ci` then `npm test` with Node.js 22+.

Every push and pull request runs frontend checks with simulated API responses.
Successful `main`/`trial` pushes publish versioned candidate images. Combined
browser testing and selection of the frontend/backend pair belong to
`persona_stand_ec2yml`; publishing an image does not deploy it.
