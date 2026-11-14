# Documentation

Start with the first three. The rest is for when you want the detail.

## Understand it

| Document | What it covers |
| --- | --- |
| [Overview](overview.md) | How the system works, in ten minutes: who uses it, the life of an alert, how it is built |
| [Feature tour](features.md) | Every feature, screen by screen, for each kind of user |
| [Results](results.md) | What was tested, what passed, and what the tests do not show |
| [Roadmap](roadmap.md) | The phases the system was built in, and what was set aside |

## Run it and test it

| Document | What it covers |
| --- | --- |
| [Running the system](running/README.md) | Starting everything on one laptop: first run, terminal, VS Code, the app, each optional feature, troubleshooting |
| [Testing](testing.md) | The five testing layers and how to demonstrate the system |
| [Testing the API with Postman](api-testing.md) | The Postman collection, step by step, and from the terminal with Newman |
| [Evidence](evidence) | The recorded system test runs and the dependency audit |

## Look something up

| Document | What it covers |
| --- | --- |
| [API reference](api.md) | Every endpoint, who may call it, and its filters |
| [Architecture](architecture.md) | How escalation, notifications and live updates actually work |
| [Module guide](module-guide.md) | Where each feature lives in the API, and the rules between modules |
| [Database, beyond the original design](schema-extensions.md) | Every table and column added since the Chapter 4 diagram |
| `backend/src/modules/*/README.md` | One per API module: what it owns, its endpoints, its files |
| [The app](../frontend/mobile/README.md) | The Flutter app, screen by screen, and how it is put together |
| [The console](../frontend/dashboard/README.md) | The administrator console |

## Why it is the way it is

| Document | What it covers |
| --- | --- |
| [Decisions](decisions/README.md) | Choices that are not obvious from the code, and why, grouped by topic |
| [Design language](design-language.md) | The rules every screen follows, and which are enforced by a check |
| [PRODUCT.md](../PRODUCT.md) | Who the product is for and what it must stay true to |
| [DESIGN.md](../DESIGN.md) | The visual system: colours, type, components, do's and don'ts |

The decisions, by topic:

- [Severity and escalation](decisions/escalation.md)
- [Reaching people: push, texts, calls and live updates](decisions/reaching-people.md)
- [The elder's experience](decisions/elder-experience.md)
- [Care circles, responders and volunteers](decisions/care-circle.md)
- [Accounts and security](decisions/accounts-and-security.md)
- [Privacy, consent and personal data](decisions/privacy.md)
- [Design of the app and the console](decisions/design.md)
- [The console and running the system](decisions/console-and-operations.md)
