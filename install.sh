#!/bin/bash
echo "Starting installation..."
rm -f package-lock.json
npm install --omit=dev
echo "Installation completed!" 