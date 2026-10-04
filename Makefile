.PHONY: format audit verify install clean check

# Format every tracked file with Prettier.
format:
	bun x prettier --write .

# Verify Prettier formatting without modifying anything.
check:
	bun x prettier --check .

# Run the secret/private-file scanner. Fails non-zero on any finding.
audit:
	./scripts/audit.sh

# Full local CI gate: prettier check + audit + per-extension tests.
# Per-extension tests skip dirs without package.json (no deps to install).
verify: check audit
	@set -e; \
	for d in files/extensions/*/; do \
	  n=$$(basename $$d); \
	  [ "$$n" = "_shared" ] && continue; \
	  if [ -f "$$d/package.json" ]; then \
	    echo ">> checking $$n"; \
	    (cd $$d && bun install --silent && bun run check && bun test); \
	  fi; \
	done

# Convenience: install every extension that has a package.json.
install:
	@set -e; \
	for d in files/extensions/*/; do \
	  n=$$(basename $$d); \
	  [ "$$n" = "_shared" ] && continue; \
	  if [ -f "$$d/package.json" ]; then \
	    echo ">> installing $$n"; \
	    (cd $$d && bun install --silent); \
	  fi; \
	done

# Drop generated artifacts so a fresh checkout is clean.
clean:
	rm -rf files/extensions/*/node_modules files/extensions/*/bun.lock