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
    echo "🍺 Homebrew already installed. Updating metadata..."
    brew update
fi

# 2. Install essential dependencies
echo "📦 Ensuring essential dependencies (git, bun, doppler) are installed and up to date..."

# Function to ensure a tap is present
ensure_tap() {
    if ! brew tap | grep -q "$1"; then
        echo "🍺 Tapping $1..."
        brew tap "$1"
    fi
}

# Function to ensure a formula is installed and updated
ensure_formula() {
    if brew list "$1" &>/dev/null; then
        if brew outdated "$1" &>/dev/null; then
            echo "🆙 Updating $1..."
            brew upgrade "$1"
        else
            echo "✅ $1 is already up to date."
        fi
    else
        echo "📥 Installing $1..."
        brew install "$1"
    fi
}

ensure_tap "oven-sh/bun"
ensure_formula "git"
ensure_formula "bun"
ensure_formula "doppler"

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
