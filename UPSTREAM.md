# Source provenance

HarnessStudio is an independent derivative of Codeg, licensed under Apache-2.0.

- Upstream: https://github.com/spacering-net/codeg
- Source: local checkout at D:\Code\codeg, version 0.34.0
- Source revision: 1b68ee1855beb67133f4b96b8f255e8386eb1f19
- Initial derivative version: 0.1.0
- Original license: LICENSE; third-party licenses and notices are retained in their original directories.

The source was exported without the upstream .git directory. HarnessStudio starts with its own root commit and has no upstream Git remote.

Initial modifications remove the categorized welcome quick actions and their preference, remove remote workspace launch and management menus, unregister the corresponding desktop commands, disable remote workspace window creation and restoration, rename the sidebar folder section to Projects in every supported locale, establish independent desktop/data/credential identities, and disconnect the upstream update channel. Regression tests and developer documentation are adjusted accordingly. Other UI and runtime capabilities are inherited from Codeg.

The codeg crate/binary names, internal agent links and CODEG_* environment overrides remain compatible. Release/installer scripts and localized upstream readmes remain upstream reference material and must be adapted to this project's own distribution channel before publishing releases.
