# Source provenance

harness studio is an independent derivative of Codeg, licensed under Apache-2.0.

- Upstream: https://github.com/spacering-net/codeg
- Source: local checkout at D:\Code\codeg, version 0.34.0
- Source revision: 1b68ee1855beb67133f4b96b8f255e8386eb1f19
- Initial derivative version: 0.1.0
- Original license: LICENSE; third-party licenses and notices are retained in their original directories.

The source was exported without the upstream .git directory. harness studio starts with its own root commit and has no upstream Git remote.

Initial modifications remove the categorized welcome quick actions and their preference, remove remote workspace launch and management menus, unregister the corresponding desktop commands, disable remote workspace window creation and restoration, rename the sidebar folder section to Projects in every supported locale, establish independent desktop/data/credential identities, and disconnect the upstream update channel. Regression tests and developer documentation are adjusted accordingly. Other UI and runtime capabilities are inherited from Codeg.

Subsequent modifications make this a desktop-only application: the embedded Web service, its settings and auto-start, browser login, standalone server binary, HTTP/WebSocket application routes, Docker deployment files and server/container release jobs are removed. Shared desktop event delivery is retained in `events.rs`. The display name is `harness studio`; package/binary names use `harness-studio`, Rust identifiers use `harness_studio`, and environment variables use `HARNESS_STUDIO_*`. Internal links use `harnessstudio://`. Upstream README copies and application links to the upstream project have been removed. Required attribution remains in this file and applicable licenses/notices. This project does not connect to the upstream update channel.
