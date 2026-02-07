# Klaus Code

> A fork of [Roo Code](https://github.com/RooCodeInc/Roo-Code) that preserves the Claude Code provider feature.

## Fork Notice

This is **Klaus Code**, a community fork of Roo Code.

### Why this fork exists

Roo Code removed the Claude Code provider in [commit 7f854c0](https://github.com/RooCodeInc/Roo-Code/commit/7f854c0dd7ed25dac68a2310346708b4b64b48d9). This fork restores and maintains that feature, allowing users to authenticate with Claude Code OAuth tokens.

This repository contains a non-functional proof-of-concept demonstrating architectural patterns for client-side API abstraction and request lifecycle handling.
This project is not intended to enable access to any proprietary service, bypass access controls, or replicate any commercial offering.
Any implementation of service-specific adapters is the sole responsibility of the user and must comply with applicable terms of service and law.
The code is published for educational and interoperability research purposes. No proprietary code, credentials, or confidential information are included.

### Key differences from upstream

- **Claude Code Provider**: Restored and maintained - screen from 2026.02.06: <img width="1497" height="1091" alt="image" src="https://github.com/user-attachments/assets/ec6cf79b-b2bd-45c8-88a5-6edc44c3fa52" />

- **Branding**: Renamed from "Roo Code" to "Klaus Code"

### Original project

- **Roo Code original link**: https://github.com/RooCodeInc/Roo-Code
- **Roo Code documentation**: https://docs.roocode.com

### For Developers

- **[Development Guide](DEVELOPMENT.md)**: Build instructions, environment setup, and release process

- **Quick Install**: Clone the GitHub repository from https://github.com/PabloVitasso/Klaus-Code, build a VS Code .vsix using vsce package, and install it.

### License

[Apache 2.0](./LICENSE)
