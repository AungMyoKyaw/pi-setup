.PHONY: format audit verify install clean check test typecheck smoke

format:
	bun x prettier --write .

check:
	bun x prettier --check .

audit:
	./scripts/audit.sh

# The same offline gate runs locally and in CI. Live classifier tests are opt-in.
verify: check audit typecheck test

# --no-save preserves existing lockfiles, including local untracked lockfiles.
install:
	@set -e; \
	for d in files/extensions/*/; do \
	  if [ -f "$$d/package.json" ]; then \
	    echo ">> installing $$(basename $$d)"; \
	    (cd $$d && bun install --silent --no-save); \
	  fi; \
	done

typecheck: install
	@set -e; \
	for d in files/extensions/*/; do \
	  if [ -f "$$d/package.json" ]; then \
	    echo ">> checking $$(basename $$d)"; \
	    (cd $$d && bun run check); \
	  fi; \
	done

# Discover tests in every extension, not just directories with package.json.
test: install
	./scripts/test.sh

smoke:
	./scripts/smoke.sh

# Dependency cleanup must not remove user-owned lockfiles.
clean:
	rm -rf files/extensions/*/node_modules
