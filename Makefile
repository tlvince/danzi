TESTS = test/*.js

test:
	@NODE_ENV=test ./node_modules/.bin/mocha \
		--reporter spec

.PHONY: test
