# Security Policy

These userscripts execute **inside your browser on the pages you visit**, often
with access to page content and (when `@grant`ed) privileged `GM_*` APIs. We take
their safety seriously.

## Reporting a vulnerability

**Please report privately — do not open a public issue.**

Use GitHub's private vulnerability reporting:

➡️ **[Report a vulnerability](https://github.com/Skriptey/Userscripts/security/advisories/new)**
(repository **Security → Advisories → Report a vulnerability**)

Include, where possible:

- the affected script (folder slug) and its `@version`,
- the browser, OS, and userscript manager,
- a description and steps to reproduce (a proof-of-concept is welcome),
- the impact you believe it has.

We aim to acknowledge reports within **5 working days** and to ship a fix or
mitigation as quickly as the severity warrants. We'll credit you in the advisory
unless you'd prefer to remain anonymous.

## What's in scope

- A script doing something it shouldn't: exfiltrating page data, injecting
  unsafe HTML/JS, requesting excessive permissions, or behaving maliciously.
- A script pulling in remote code (`@require`) from a non-pinned or
  compromised source.
- Secrets accidentally committed to this repository.
- Vulnerabilities in the build/CI tooling under `tools/` or `.github/`.

## What's out of scope

- Vulnerabilities in the **target websites** themselves.
- Vulnerabilities in the **userscript manager** (report those to Tampermonkey /
  Violentmonkey) or the **browser**.
- Issues that require an already-compromised machine or a malicious browser
  extension to exploit.

## Supported versions

Only the **latest published version of each script** (as served from
<https://skriptey.github.io/Userscripts/>) is supported. Please update before
reporting, in case the issue is already fixed.

## Good practice for users

- Read a script before installing — the source here is exactly what runs.
- Prefer scripts that declare `@grant none` or a minimal set of `GM_*` grants.
- Keep your userscript manager and browser up to date.
