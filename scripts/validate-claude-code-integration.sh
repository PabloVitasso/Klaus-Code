#!/bin/bash
# validate-claude-code-integration.sh
# Validates that Claude Code provider integration is intact after upstream merges
# Run this after merging from Roo Code upstream to verify critical components

echo "=== Validating Claude Code Components ==="

# 1. Backend schema validation
echo -n "✓ Provider schema: "
grep -q 'claudeCodeSchema' packages/types/src/provider-settings.ts && \
grep -q 'claudeCodeSchema.*claude-code' packages/types/src/provider-settings.ts && \
echo "PASS" || echo "FAIL - missing from discriminated union"

# 2. Provider factory registration (CRITICAL!)
echo -n "✓ Provider export: "
grep -q 'export.*ClaudeCodeHandler' src/api/providers/index.ts && \
echo "PASS" || echo "FAIL - not exported from providers/index.ts"

echo -n "✓ Provider import: "
grep -q 'ClaudeCodeHandler' src/api/index.ts | grep -q 'import' && \
echo "PASS" || echo "FAIL - not imported in api/index.ts"

echo -n "✓ Provider factory case: "
grep -q 'case "claude-code"' src/api/index.ts && \
echo "PASS" || echo "FAIL - missing switch case in buildApiHandler()"

# 3. OAuth manager initialization
echo -n "✓ OAuth init: "
grep -q 'claudeCodeOAuthManager.initialize' src/extension.ts && \
echo "PASS" || echo "FAIL - not initialized in extension.ts"

# 4. Frontend UI components
echo -n "✓ UI exports: "
grep -q 'export.*ClaudeCode' webview-ui/src/components/settings/providers/index.ts && \
echo "PASS" || echo "FAIL - missing from provider exports"

echo -n "✓ UI dropdown: "
grep -q 'claude-code.*Claude Code' webview-ui/src/components/settings/constants.ts && \
echo "PASS" || echo "FAIL - missing from PROVIDERS array"

echo -n "✓ UI config: "
grep -q 'claude-code.*claudeCodeDefaultModelId' webview-ui/src/components/settings/ApiOptions.tsx && \
echo "PASS" || echo "FAIL - missing from PROVIDER_MODEL_CONFIG"

# 5. Activity bar branding
echo -n "✓ Activity bar: "
grep -q 'klaus-code-ActivityBar' src/package.json && \
echo "PASS" || echo "FAIL - upstream overwrote with roo-cline IDs"

# 6. Tool name prefix (critical)
echo -n "✓ Tool prefix: "
grep -q 'TOOL_NAME_PREFIX.*=.*"oc_"' src/integrations/claude-code/streaming-client.ts && \
echo "PASS" || echo "FAIL - tool prefix constant missing"

# 7. Verify model selection uses claudeCodeModels
echo -n "✓ Model selection: "
grep -q 'case "claude-code":' webview-ui/src/components/ui/hooks/useSelectedModel.ts && \
grep -A 2 'case "claude-code":' webview-ui/src/components/ui/hooks/useSelectedModel.ts | grep -q 'claudeCodeModels' && \
echo "PASS" || echo "FAIL - using anthropicModels instead of claudeCodeModels"

# 8. Verify checkExistApiConfig includes claude-code
echo -n "✓ API config check: "
grep -q 'claude-code' src/shared/checkExistApiConfig.ts && \
echo "PASS" || echo "FAIL - claude-code missing from providers list"

# 9. Type checks and tests
echo -n "✓ Types: "
pnpm check-types --filter @klaus-code/types &>/dev/null && echo "PASS" || echo "FAIL"

echo -n "✓ Tests: "
cd src && npx vitest run integrations/claude-code/__tests__/ &>/dev/null && \
echo "PASS" || echo "FAIL"

echo "=== Validation Complete ==="
