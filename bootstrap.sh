#!/bin/bash
set -e

# Macmuffin Bootstrap Script
# Usage: curl -sL https://raw.githubusercontent.com/Deester4x4jr/dotfiles/feat/macmuffin/bootstrap.sh | bash

REPO_URL="https://github.com/Deester4x4jr/dotfiles.git"
TARGET_DIR="$HOME/.macmuffin"
BRANCH="feat/macmuffin" # Using the current feature branch for development

echo "🐶 Welcome to Macmuffin! Let's get your machine ready..."

# 1. Install Homebrew if not present
if ! command -v brew >/dev/null 2>&1; then
    echo "🍺 Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Add brew to path for the rest of the script
    if [[ $(uname -m) == "arm64" ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    else
        eval "$(/usr/local/bin/brew shellenv)"
    fi
else
    echo "🍺 Homebrew already installed."
fi

# 2. Install essential dependencies
echo "📦 Installing essential dependencies (git, bun, doppler)..."
brew tap oven-sh/bun
brew install git bun doppler

# 3. Setup ~/.macmuffin
if [ ! -d "$TARGET_DIR" ]; then
    echo "📂 Cloning configuration to $TARGET_DIR..."
    git clone --branch "$BRANCH" "$REPO_URL" "$TARGET_DIR"
else
    echo "📂 $TARGET_DIR already exists. Updating..."
    cd "$TARGET_DIR"
    git fetch origin
    git checkout "$BRANCH"
    git pull origin "$BRANCH"
fi

# 4. Install Node dependencies
echo "🧶 Installing Node dependencies for macmuffin-cli..."
cd "$TARGET_DIR/dotfile-manager"
bun install

# 5. Run the interactive CLI
echo "🚀 Launching Macmuffin CLI..."
bun run index.ts sync
