DEFAULT_GOAL := help
.PHONY : check lint install-linters dep
OPTS?=GO111MODULE=on
TEST_OPTS?=-race -tags no_ci -cover -timeout=10m

# Static files directory
GUI_STATIC_DIR = src/gui/static

check: lint test ## Run linters and tests

lint: ## Run linters. Use make install-linters first
	${OPTS} golangci-lint run -c .golangci.yml ./...
	# The govet version in golangci-lint is out of date and has spurious warnings, run it separately
	${OPTS} go vet -all ./...

vendorcheck:  ## Run vendorcheck
	GO111MODULE=off vendorcheck ./...

test: ## Run tests
	-go clean -testcache &>/dev/null
	${OPTS} go test ${TEST_OPTS} ./...

install-linters: ## Install linters
	- VERSION=1.23.8 ./ci_scripts/install-golangci-lint.sh
	# GO111MODULE=off go get -u github.com/FiloSottile/vendorcheck
	# For some reason this install method is not recommended, see https://github.com/golangci/golangci-lint#install
	# However, they suggest `curl ... | bash` which we should not do
	# ${OPTS} go get -u github.com/golangci/golangci-lint/cmd/golangci-lint
	${OPTS} go get -u golang.org/x/tools/cmd/goimports

format: ## Formats the code. Must have goimports installed (use make install-linters).
	${OPTS} goimports -w -local github.com/SkycoinProject/multicoin-wallet .

dep: ## Sorts dependencies
	${OPTS} go mod download
	${OPTS} go mod tidy -v

install-deps-ui:  ## Install the UI dependencies
	cd $(GUI_STATIC_DIR) && npm ci

lint-ui:  ## Lint the UI code
	cd $(GUI_STATIC_DIR) && npm run lint

build-ui:  ## Builds the UI
	cd $(GUI_STATIC_DIR) && npm run build

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'
