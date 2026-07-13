#!/usr/bin/env bash
set -euo pipefail

echo "CAN bridge daemon Linux/WSL prerequisite setup"

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required for package installation and vcan setup."
  exit 1
fi

sudo apt update
sudo apt install -y \
  build-essential \
  pkg-config \
  libssl-dev \
  clang \
  protobuf-compiler \
  iproute2

if ! command -v cargo >/dev/null 2>&1; then
  echo ""
  echo "Rust is not installed. Install it with:"
  echo "  curl https://sh.rustup.rs -sSf | sh"
  echo "  source ~/.cargo/env"
else
  cargo --version
fi

echo ""
echo "Optional vcan0 setup for development:"
echo "  sudo modprobe vcan"
echo "  sudo ip link add dev vcan0 type vcan"
echo "  sudo ip link set up vcan0"
echo ""
echo "Then start the daemon from the can_bridge_daemon repo:"
echo "  cargo run -- --tcp-bind 0.0.0.0:9500 --ws-bind 0.0.0.0:9501 --grpc-bind 0.0.0.0:9502"
