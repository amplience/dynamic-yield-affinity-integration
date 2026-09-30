# Contributing

Thank you for helping improve this schema starter.

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- Open an issue first for a substantial schema-interface change.
- Never include credentials, personal data, private hub identifiers, or
  proprietary customer schemas and screenshots.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Make a change

1. Fork the repository and create a branch from `main`.
2. Use one of the allowed prefixes: `feature/`, `bugfix/`, `hotfix/`, `chore/`,
   `docs/`, or `release/`.
3. Install dependencies with `npm ci`.
4. Make the smallest coherent change and update the README or fixtures when the
   schema interface changes.
5. Run `npm run lint` and `npm test`.
6. Open a pull request using the repository template.

Use concise, imperative commit subjects. Sign commits when required by the
repository rules.

## Schema changes

Schema IDs and property names are public interfaces. In a pull request that
changes them, describe migration impact and whether the change is breaking.

Keep the targeting partial definitions-only. New remote references, extension
dependencies, targeting dimensions, or delivery keys must be documented and
covered by validation. For behavior that depends on Amplience, include the
result of a non-production smoke test.

## License

By submitting a contribution, you agree that it will be licensed under the
repository's [Apache License 2.0](LICENSE).
