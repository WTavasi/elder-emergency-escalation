# Dependency audit, before and after (issue #82)

`npm audit` on the whole workspace, and with `--omit=dev` for only what the server and the
console ship. Run on Node 22.22 and npm 10.9, the versions CI uses. The full reports are
the four JSON files beside this one.

| | Critical | High | Moderate | Low | Total |
| --- | --- | --- | --- | --- | --- |
| Before, everything | 1 | 11 | 24 | 8 | 44 |
| After, everything | 0 | 3 | 23 | 8 | 34 |
| Before, shipped code only | 0 | 7 | 9 | 0 | 16 |
| After, shipped code only | 0 | 3 | 8 | 0 | 11 |

## What changed

- `@nestjs/common`, `core`, `testing`, `platform-express`, `platform-socket.io` and
  `websockets` from 11.2.3 and 11.2.4 to 11.2.9, the same minor version, which brings
  patched `multer`, `body-parser` and `qs` with it.
- `vite` from 8.3.0 to 8.3.7.
- Indirect packages updated within the ranges their parents allow: `@grpc/grpc-js`
  1.14.7, `body-parser` 2.4.0, `undici` 8.12.4, `zod` 4.6.7, `handlebars` 4.7.10 (the
  critical one, reached only through `ts-jest`).

After the change: 913 backend unit tests, the integration suite and 83 console tests
pass, and both build.

## Accepted for now, and why

- **Prisma 7 (3 high).** `deepmerge-ts`, through `@prisma/config`, which only the Prisma
  command-line tool loads, when migrating or generating. The running server never loads
  it. The fix is Prisma 7, a major version with breaking changes to configuration and the
  client, so it is a planned upgrade of its own, not a patch.
- **Firebase Admin 14 (moderate).** `uuid` below 11.1.1, reached through
  `firebase-admin` 13 and Google's libraries. The flaw is a missing bounds check when a
  caller passes its own buffer to `v3`, `v5` or `v6`; the server calls none of them, and
  Google's libraries use `v4`. The fix is `firebase-admin` 14, a major version.
- **Development tools only (moderate).** `eslint`, `typescript-eslint`, `@nestjs/cli` and
  `vitest`: none of them ship. They are updated with their next major versions.

`npm audit fix` itself stopped with an internal npm error on this workspace ("Cannot read
properties of null (reading 'edgesOut')"), so the indirect packages were updated with
`npm update` instead. `npm audit fix --force` was not used: it applies major versions
without review.
