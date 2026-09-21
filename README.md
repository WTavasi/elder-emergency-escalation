# MzaziCare Escalation

A real-time emergency response coordination and escalation framework for home-based
elderly care, built as the MzaziCare platform's alerting subsystem.

One panic button raises an alert. The system scores its severity from six weighted
factors, then works down a ranked chain of responders, caregiver to family member to
emergency responder, promoting the alert automatically when a tier fails to acknowledge
inside its timeout, with an SMS fallback where push cannot be delivered. Every state
change is written to an audit log, and every escalation decision can be explained after
the fact from the factor values stored alongside it.

Final year project, Strathmore University. Not a medical device. It detects nothing on
its own and is not a substitute for emergency services.

## Getting started

New to the project, or starting the laptop from cold? Read
**[docs/running.md](docs/running.md)**, which walks through it step by step for both a
plain terminal and VS Code.

The short version, once the project is already set up:

```bash
docker compose up -d      # Postgres and Redis
npm run dev               # the API, on port 3000
npm run dev:dashboard     # the dashboard, on port 5173
```

Sign in at http://localhost:5173 with `+254700000001` and `Dev!2026`.
