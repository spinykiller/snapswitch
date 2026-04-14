.PHONY: build install deploy deploy-vsce deploy-ovsx clean

# Build the extension into a .vsix package
build: clean
	@echo "Packaging extension..."
	npx --yes @vscode/vsce package

# Install the extension locally in VS Code for testing
install: build
	@echo "Installing locally..."
	code --install-extension snapswitch-vscode-*.vsix --force

# Deploy to both Microsoft VS Marketplace and OpenVSX
deploy: build deploy-vsce deploy-ovsx
	@echo "Successfully deployed to all marketplaces!"

# Deploy to Microsoft VS Marketplace
deploy-vsce:
	@echo "Publishing to VS Code Marketplace..."
	npx --yes @vscode/vsce publish

# Deploy to Open VSX Registry
deploy-ovsx:
	@echo "Publishing to Open VSX Registry..."
	npx --yes ovsx publish

# Remove any generated packaged files
clean:
	@echo "Cleaning old builds..."
	rm -f *.vsix
