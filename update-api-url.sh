#!/bin/bash

# Update import paths for API_URL in all TypeScript files
find src/frontend -type f -name "*.ts" -o -name "*.tsx" | while read -r file; do
  # Skip the config.ts file itself
  if [[ "$file" == "src/frontend/config.ts" ]]; then
    continue
  fi
  
  # Get the relative path to the config.ts file
  dir=$(dirname "$file")
  rel_path=$(realpath --relative-to="$dir" "src/frontend")
  
  # If the file is in the frontend directory, use './config'
  if [[ "$dir" == "src/frontend" ]]; then
    sed -i 's|import { API_URL } from "../../config";|import { API_URL } from "./config";|g' "$file"
  # If the file is one level deep (e.g., src/frontend/components)
  elif [[ "$dir" == src/frontend/* ]]; then
    sed -i 's|import { API_URL } from "../../config";|import { API_URL } from "../config";|g' "$file"
  # If the file is two levels deep (e.g., src/frontend/components/charts)
  elif [[ "$dir" == src/frontend/*/* ]]; then
    sed -i 's|import { API_URL } from "../../config";|import { API_URL } from "../../config";|g' "$file"
  fi
done

echo "Import paths updated successfully!" 