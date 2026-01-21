# Publish to npm

## Overview
Build, commit, tag, and publish the package to npm registry with the latest tag.

## Steps

1. **Run tests** (optional but recommended)
   - Run `pnpm test` to ensure all tests pass
   - Skip if tests are already passing

2. **Build the package**
   - Run `pnpm run build` to compile the library
   - Ensure no build errors occur

3. **Check for uncommitted changes**
   - Check git status for uncommitted changes
   - If changes exist, warn the user to commit them first
   - Do not automatically commit - let user review and commit manually

4. **Create git tag**
   - Create a git tag matching the package.json version
   - Format: `v{version}` (e.g., v1.0.4)

5. **Publish to npm**
   - Run `pnpm publish --access public --tag latest`
   - Ensure the package is published with public access
   - Set the npm dist-tag to "latest"

6. **Push to git**
   - Push commits to origin/main
   - Push the new version tag to remote

## Checklist
- [ ] All tests passing
- [ ] Package built successfully
- [ ] Changes committed
- [ ] Version tag created
- [ ] Published to npm
- [ ] Pushed to git remote

## Error Handling
- If git is not clean, commit or stash changes first
- If npm publish fails, check npm authentication (`npm whoami`)
- If git push fails, ensure you have push permissions
