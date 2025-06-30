#!/usr/bin/env bash
set -euo pipefail

# Exit immediately if Doppler CLI is already in our $PATH and logged in
type doppler >/dev/null 2>&1 && doppler me >/dev/null 2>&1 && exit 0

if type doppler >/dev/null 2>&1; then
    if doppler me >/dev/null 2>&1; then
        echo "You are logged in to Doppler already."
    else
        echo "Please login to Doppler:"
        doppler login -y
    fi
else
    case "$(uname -s)" in
    Darwin)
        echo "Installing Doppler, then please login:"
        brew install doppler
        doppler login -y
        ;;
    *)
        echo "Unsupported OS"
        exit 1
        ;;
    esac

fi